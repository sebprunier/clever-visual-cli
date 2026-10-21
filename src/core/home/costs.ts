/**
 * Costs of applications and add-ons, from four sources normalised to one
 * shape: an amount per resource over a period, tax excluded, in the
 * organisation's currency.
 *
 * - `estimate`: the current configuration priced with the price system, a
 *   month where nothing changes. A started application costs the hourly
 *   price of its scaler size for 720 hours (the 30-day month of Clever
 *   Cloud's pricing page) times its minimum number of instances, a stopped
 *   one costs nothing; an add-on costs its plan whatever the state of the
 *   applications around it. Storage, traffic and third party vendors are
 *   not included.
 * - `yesterday`: the last day computed by the billing system, one row per
 *   resource.
 * - `days30`: the sum of the last 30 daily consumptions computed by the
 *   billing system, one row per resource, the figures behind the Console's
 *   consumption page.
 * - `invoice`: the lines of the latest invoice, a closed month.
 *
 * Resources are keyed by the id the billing system uses: the application id,
 * the add-on real id (`postgresql_…`, `bucket_…`), or the add-on id for third
 * party vendors.
 */
import type { GroupNode } from './grouping.js';

export const HOURS_PER_MONTH = 720;

export type CostSource = 'yesterday' | 'days30' | 'invoice' | 'estimate';

/** In display order. */
export const COST_SOURCES: readonly CostSource[] = ['yesterday', 'days30', 'invoice', 'estimate'];

export interface CostTable {
  source: CostSource;
  currency: string;
  /** Amount per resource id over the period. */
  amounts: ReadonlyMap<string, number>;
  /** The days summed or the invoice period; null for an estimate. */
  period: { from: string; to: string } | null;
  /** Invoice number, or empty. */
  reference: string;
  /** Estimate only: what each stopped application would cost started. */
  ifStarted?: ReadonlyMap<string, number>;
}

export interface CostRow {
  id: string;
  amount: number;
}

/** What an application costs to run, as configured. */
export interface AppPricing {
  id: string;
  /** Price of one instance of the minimum size for one hour. */
  hourlyPrice: number;
  minInstances: number;
  /** False for a stopped application, or one that never started. */
  running: boolean;
}

/** What an add-on costs, as subscribed. */
export interface AddonPricing {
  id: string;
  realId: string;
  /** Null when the plan has no known price. */
  monthlyPrice: number | null;
}

export function estimateCosts(
  apps: readonly AppPricing[],
  addons: readonly AddonPricing[],
  currency: string,
): CostTable {
  const amounts = new Map<string, number>();
  const ifStarted = new Map<string, number>();
  for (const app of apps) {
    const monthly = app.hourlyPrice * Math.max(app.minInstances, 1) * HOURS_PER_MONTH;
    amounts.set(app.id, app.running ? monthly : 0);
    if (!app.running) {
      ifStarted.set(app.id, monthly);
    }
  }
  for (const addon of addons) {
    if (addon.monthlyPrice != null) {
      amounts.set(addon.realId, addon.monthlyPrice);
    }
  }
  return { source: 'estimate', currency, amounts, period: null, reference: '', ifStarted };
}

/** One day of consumption as the billing system computed it. */
export interface DailyConsumption {
  /** `YYYY-MM-DD`. */
  date: string;
  rows: CostRow[];
}

export function sumDays(days: readonly DailyConsumption[], currency: string): CostTable {
  const amounts = new Map<string, number>();
  for (const day of days) {
    for (const row of day.rows) {
      amounts.set(row.id, (amounts.get(row.id) ?? 0) + row.amount);
    }
  }
  const dates = days.map((day) => day.date).sort();
  return {
    source: 'days30',
    currency,
    amounts,
    period: dates.length === 0 ? null : { from: dates[0], to: dates[dates.length - 1] },
    reference: '',
  };
}

/** One day as a table, the `yesterday` source. */
export function dayCosts(day: DailyConsumption, currency: string): CostTable {
  return { ...sumDays([day], currency), source: 'yesterday' };
}

export function dayTotal(day: DailyConsumption | null | undefined): number | null {
  if (day == null) {
    return null;
  }
  return day.rows.reduce((total, row) => total + row.amount, 0);
}

/** The lines of one invoice, already reduced to one amount per resource. */
export interface InvoiceLines {
  number: string;
  from: string;
  to: string;
  currency: string;
  rows: CostRow[];
}

export function invoiceCosts(invoice: InvoiceLines): CostTable {
  const amounts = new Map<string, number>();
  for (const row of invoice.rows) {
    amounts.set(row.id, (amounts.get(row.id) ?? 0) + row.amount);
  }
  return {
    source: 'invoice',
    currency: invoice.currency,
    amounts,
    period: { from: invoice.from, to: invoice.to },
    reference: invoice.number,
  };
}

/** The `count` days before today, oldest first, as `YYYY-MM-DD` in UTC. */
export function lastDays(count: number, now = Date.now()): string[] {
  const today = new Date(now);
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days: string[] = [];
  for (let offset = count; offset >= 1; offset -= 1) {
    days.push(new Date(start - offset * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

// --- lookups -----------------------------------------------------------------

interface Keyed {
  id: string;
  realId?: string;
}

/** The amount of one resource, or null when the table has no line for it. */
export function resourceCost(table: CostTable, resource: Keyed): number | null {
  const byReal = resource.realId == null ? undefined : table.amounts.get(resource.realId);
  return byReal ?? table.amounts.get(resource.id) ?? null;
}

/**
 * What a row shows: a resource absent from a billed period cost nothing,
 * while the estimate simply has no price for it.
 */
export function shownCost(table: CostTable, resource: Keyed): number | null {
  return resourceCost(table, resource) ?? (table.source === 'estimate' ? null : 0);
}

/** The sum of a group and its sub-groups; resources without a line count for zero. */
export function nodeCost(node: GroupNode, table: CostTable): number {
  return totalCost([node], table);
}

/**
 * The sum of the resources under these groups, each counted once: a resource with two values for a
 * key (`project:shop` and `project:blog`) shows in two groups, yet costs once (#22).
 */
export function totalCost(nodes: readonly GroupNode[], table: CostTable): number {
  let total = 0;
  for (const resource of distinctResources(nodes)) {
    total += resourceCost(table, resource) ?? 0;
  }
  return total;
}

function distinctResources(nodes: readonly GroupNode[]): Keyed[] {
  const resources = new Map<string, Keyed>();
  const visit = (node: GroupNode) => {
    for (const resource of [...node.apps, ...node.addons]) {
      resources.set(resource.id, resource);
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return [...resources.values()];
}

/**
 * The lines of the table that match none of the given resources: deleted
 * resources, or ones hidden by the filter.
 */
export function unlistedCost(table: CostTable, resources: readonly Keyed[]): { amount: number; count: number } {
  const known = new Set<string>();
  for (const resource of resources) {
    known.add(resource.id);
    if (resource.realId != null) {
      known.add(resource.realId);
    }
  }
  let amount = 0;
  let count = 0;
  for (const [id, value] of table.amounts) {
    if (!known.has(id)) {
      amount += value;
      count += 1;
    }
  }
  return { amount, count };
}
