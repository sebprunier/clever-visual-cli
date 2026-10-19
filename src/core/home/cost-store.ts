/**
 * Costs of one organisation, loaded on demand: the price of the current
 * configuration, the last 30 daily consumptions and the latest invoice.
 * A day or an invoice never changes once computed, so both live in
 * localStorage (`cvc.costs.<ownerId>`); the estimate is cheap and stays in
 * memory.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import {
  fetchDailyConsumption,
  fetchInvoiceLines,
  fetchLatestInvoice,
  fetchPriceSystem,
  fetchPricing,
  type PriceSystem,
} from '../../data/api.js';
import { describeError } from '../clever-client.js';
import {
  estimateCosts,
  invoiceCosts,
  lastDays,
  sumDays,
  type CostSource,
  type CostTable,
  type DailyConsumption,
  type InvoiceLines,
} from './costs.js';

const DAYS = 30;
const ESTIMATE_TTL = 60 * 60_000;
const INVOICE_CHECK_TTL = 6 * 60 * 60_000;
const DAYS_CONCURRENCY = 4;

export interface OwnerCosts {
  /** Currency of the organisation, known once the price system answered. */
  currency: string | null;
  estimate: CostTable | null;
  estimateAt: number;
  estimateLoading: boolean;
  estimateError: string | null;
  /** The days computed by the billing system, by date. */
  days: Record<string, DailyConsumption>;
  daysPending: number;
  daysError: string | null;
  invoice: InvoiceLines | null;
  invoiceAt: number;
  invoiceLoading: boolean;
  invoiceError: string | null;
}

export interface CostRefreshOptions {
  force?: boolean;
}

interface Stored {
  days: Record<string, Array<[string, number]>>;
  invoice: InvoiceLines | null;
}

export class CostStore extends EventTarget {
  #data = new Map<string, OwnerCosts>();
  #inflight = new Map<string, Promise<void>>();
  #daysTable = new Map<string, { keys: string; table: CostTable }>();

  get(ownerId: string): OwnerCosts {
    let data = this.#data.get(ownerId);
    if (data == null) {
      const stored = readStored(ownerId);
      data = {
        currency: null,
        estimate: null,
        estimateAt: 0,
        estimateLoading: false,
        estimateError: null,
        days: Object.fromEntries(
          Object.entries(stored?.days ?? {}).map(([date, rows]) => [
            date,
            { date, rows: rows.map(([id, amount]) => ({ id, amount })) },
          ]),
        ),
        daysPending: 0,
        daysError: null,
        invoice: stored?.invoice ?? null,
        invoiceAt: 0,
        invoiceLoading: false,
        invoiceError: null,
      };
      this.#data.set(ownerId, data);
    }
    return data;
  }

  /** The days of the window that are known, oldest first. */
  recentDays(ownerId: string): DailyConsumption[] {
    const data = this.get(ownerId);
    return lastDays(DAYS)
      .map((date) => data.days[date])
      .filter((day): day is DailyConsumption => day != null);
  }

  yesterday(ownerId: string): DailyConsumption | null {
    const [date] = lastDays(1);
    return this.get(ownerId).days[date] ?? null;
  }

  /** The table of one source, or null while it is unknown. */
  table(ownerId: string, source: CostSource): CostTable | null {
    const data = this.get(ownerId);
    switch (source) {
      case 'estimate':
        return data.estimate;
      case 'invoice':
        return data.invoice == null ? null : invoiceCosts(data.invoice);
      case 'days30': {
        const days = this.recentDays(ownerId);
        if (days.length === 0) {
          return null;
        }
        const keys = days.map((day) => day.date).join(',');
        const memo = this.#daysTable.get(ownerId);
        if (memo != null && memo.keys === keys) {
          return memo.table;
        }
        const table = sumDays(days, data.currency ?? data.invoice?.currency ?? 'EUR');
        this.#daysTable.set(ownerId, { keys, table });
        return table;
      }
    }
  }

  /** Loads what is missing or stale; resolves when everything settled. */
  refresh(client: CcApiClient, ownerId: string, options: CostRefreshOptions = {}): Promise<void> {
    const running = this.#inflight.get(ownerId);
    if (running != null) {
      return running;
    }
    const promise = this.#run(client, ownerId, options);
    this.#inflight.set(ownerId, promise);
    void promise.finally(() => {
      if (this.#inflight.get(ownerId) === promise) {
        this.#inflight.delete(ownerId);
      }
    });
    return promise;
  }

  forget(): void {
    this.#data.clear();
    this.#daysTable.clear();
    this.#emit();
  }

  async #run(client: CcApiClient, ownerId: string, options: CostRefreshOptions): Promise<void> {
    const data = this.get(ownerId);
    let prices: PriceSystem;
    try {
      prices = await fetchPriceSystem(client, ownerId);
    } catch (error) {
      const message = describeError(error);
      data.estimateError = message;
      data.daysError = message;
      data.invoiceError = message;
      this.#emit();
      return;
    }
    data.currency = prices.currency;
    await Promise.all([
      this.#refreshEstimate(client, ownerId, prices, options),
      this.#refreshDays(client, ownerId, prices.currency, options),
      this.#refreshInvoice(client, ownerId, options),
    ]);
  }

  async #refreshEstimate(
    client: CcApiClient,
    ownerId: string,
    prices: PriceSystem,
    options: CostRefreshOptions,
  ): Promise<void> {
    const data = this.get(ownerId);
    const fresh = Date.now() - data.estimateAt < ESTIMATE_TTL;
    if (data.estimateLoading || (fresh && !options.force && data.estimate != null)) {
      return;
    }
    data.estimateLoading = true;
    this.#emit();
    try {
      const pricing = await fetchPricing(client, ownerId, prices);
      data.estimate = estimateCosts(pricing.apps, pricing.addons, prices.currency);
      data.estimateAt = Date.now();
      data.estimateError = null;
    } catch (error) {
      data.estimateError = describeError(error);
    } finally {
      data.estimateLoading = false;
      this.#emit();
    }
  }

  async #refreshDays(
    client: CcApiClient,
    ownerId: string,
    currency: string,
    options: CostRefreshOptions,
  ): Promise<void> {
    const data = this.get(ownerId);
    if (data.daysPending > 0) {
      return;
    }
    const wanted = lastDays(DAYS);
    for (const date of Object.keys(data.days)) {
      if (!wanted.includes(date)) {
        delete data.days[date];
      }
    }
    const todo = wanted.filter((date) => data.days[date] == null);
    const latest = wanted[wanted.length - 1];
    if (options.force && !todo.includes(latest)) {
      todo.push(latest);
    }
    if (todo.length === 0) {
      return;
    }
    // Newest first, so yesterday shows up before the rest.
    todo.reverse();
    data.daysPending = todo.length;
    data.daysError = null;
    this.#emit();
    let next = 0;
    let completed = 0;
    const worker = async () => {
      while (next < todo.length) {
        const date = todo[next++];
        try {
          const day = await fetchDailyConsumption(client, ownerId, date, currency);
          if (day != null) {
            data.days[date] = day;
          }
        } catch (error) {
          data.daysError = describeError(error);
        } finally {
          completed += 1;
          data.daysPending = todo.length - completed;
          if (completed % 5 === 0 || data.daysPending === 0) {
            this.#emit();
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(DAYS_CONCURRENCY, todo.length) }, worker));
    writeStored(ownerId, data);
    this.#emit();
  }

  async #refreshInvoice(client: CcApiClient, ownerId: string, options: CostRefreshOptions): Promise<void> {
    const data = this.get(ownerId);
    const fresh = Date.now() - data.invoiceAt < INVOICE_CHECK_TTL;
    if (data.invoiceLoading || (fresh && !options.force)) {
      return;
    }
    data.invoiceLoading = true;
    this.#emit();
    try {
      const latest = await fetchLatestInvoice(client, ownerId);
      if (latest == null) {
        data.invoice = null;
      } else if (data.invoice?.number !== latest.number) {
        data.invoice = await fetchInvoiceLines(client, ownerId, latest.number);
      }
      data.invoiceAt = Date.now();
      data.invoiceError = null;
      writeStored(ownerId, data);
    } catch (error) {
      data.invoiceError = describeError(error);
    } finally {
      data.invoiceLoading = false;
      this.#emit();
    }
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}

function storageKey(ownerId: string): string {
  return `cvc.costs.${ownerId}`;
}

function readStored(ownerId: string): Stored | null {
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (raw == null) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      days: typeof parsed.days === 'object' && parsed.days != null ? parsed.days : {},
      invoice: parsed.invoice ?? null,
    };
  } catch {
    return null;
  }
}

function writeStored(ownerId: string, data: OwnerCosts): void {
  const stored: Stored = {
    days: Object.fromEntries(
      Object.values(data.days).map((day) => [day.date, day.rows.map((row): [string, number] => [row.id, row.amount])]),
    ),
    invoice: data.invoice,
  };
  try {
    localStorage.setItem(storageKey(ownerId), JSON.stringify(stored));
  } catch {
    // Not essential.
  }
}

export function clearCostStorage(): void {
  try {
    for (const key of Object.keys(localStorage).filter((key) => key.startsWith('cvc.costs.'))) {
      localStorage.removeItem(key);
    }
  } catch {
    // Not essential.
  }
}
