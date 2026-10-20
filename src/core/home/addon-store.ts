/**
 * The instances of the add-ons of an organisation, hence their states, read
 * after the home list a few at a time. An add-on found without instances is
 * on a shared plan: that only changes with its plan, so the fact is kept in
 * localStorage (`cvc.addon-instances.<ownerId>`) for a day and the add-on is
 * not asked again meanwhile. Emits `change`.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { fetchAddonInstances, type AddonInstance } from '../../data/api.js';
import { addonState, type AddonState } from './addon-state.js';

const FRESH_FOR = 60_000;
const SHARED_FOR = 24 * 60 * 60_000;
const CONCURRENCY = 6;

export interface AddonInstancesEntry {
  instances: AddonInstance[] | null;
  at: number;
  error: string | null;
}

export class AddonStore extends EventTarget {
  #entries = new Map<string, Map<string, AddonInstancesEntry>>();
  #shared = new Map<string, Record<string, number>>();
  #running = new Set<string>();

  /** The state of an add-on, null while unknown. */
  state(ownerId: string, addonId: string): AddonState | null {
    if (this.#sharedSince(ownerId, addonId) != null) {
      return 'shared';
    }
    const instances = this.#owner(ownerId).get(addonId)?.instances;
    return instances == null ? null : addonState(instances);
  }

  instances(ownerId: string, addonId: string): AddonInstance[] | null {
    if (this.#sharedSince(ownerId, addonId) != null) {
      return [];
    }
    return this.#owner(ownerId).get(addonId)?.instances ?? null;
  }

  /** True while the states of the organisation are being read. */
  loading(ownerId: string): boolean {
    return this.#running.has(ownerId);
  }

  /** Reads what is unknown or stale; `force` re-reads every dedicated add-on, never the known shared ones. */
  async refresh(
    client: CcApiClient,
    ownerId: string,
    addonIds: readonly string[],
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (this.#running.has(ownerId)) {
      return;
    }
    const entries = this.#owner(ownerId);
    const now = Date.now();
    const todo = addonIds.filter((id) => {
      if (this.#sharedSince(ownerId, id) != null) {
        return false;
      }
      const entry = entries.get(id);
      return options.force || entry == null || now - entry.at > FRESH_FOR;
    });
    if (todo.length === 0) {
      return;
    }
    this.#running.add(ownerId);
    this.#emit();
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const id = todo[next++];
        await this.#read(client, ownerId, id);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    } finally {
      this.#running.delete(ownerId);
      this.#emit();
    }
  }

  /** One add-on, read now whatever is known: its page wants the instances as they are. */
  async refreshOne(client: CcApiClient, ownerId: string, addonId: string): Promise<void> {
    await this.#read(client, ownerId, addonId);
    this.#emit();
  }

  forget(): void {
    this.#entries.clear();
    this.#shared.clear();
    this.#emit();
  }

  async #read(client: CcApiClient, ownerId: string, addonId: string): Promise<void> {
    const entries = this.#owner(ownerId);
    try {
      const instances = await fetchAddonInstances(client, ownerId, addonId);
      entries.set(addonId, { instances, at: Date.now(), error: null });
      this.#markShared(ownerId, addonId, addonState(instances) === 'shared');
    } catch (error) {
      const previous = entries.get(addonId);
      entries.set(addonId, {
        instances: previous?.instances ?? null,
        at: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    this.#emit();
  }

  #owner(ownerId: string): Map<string, AddonInstancesEntry> {
    let entries = this.#entries.get(ownerId);
    if (entries == null) {
      entries = new Map();
      this.#entries.set(ownerId, entries);
    }
    return entries;
  }

  #sharedMarks(ownerId: string): Record<string, number> {
    let marks = this.#shared.get(ownerId);
    if (marks == null) {
      marks = readMarks(ownerId);
      this.#shared.set(ownerId, marks);
    }
    return marks;
  }

  #sharedSince(ownerId: string, addonId: string): number | null {
    const at = this.#sharedMarks(ownerId)[addonId];
    return at != null && Date.now() - at < SHARED_FOR ? at : null;
  }

  #markShared(ownerId: string, addonId: string, shared: boolean): void {
    const marks = this.#sharedMarks(ownerId);
    if (shared) {
      marks[addonId] = Date.now();
    } else if (marks[addonId] != null) {
      delete marks[addonId];
    } else {
      return;
    }
    try {
      localStorage.setItem(marksKey(ownerId), JSON.stringify(marks));
    } catch {
      // Not essential: the add-on is asked again next time.
    }
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}

function marksKey(ownerId: string): string {
  return `cvc.addon-instances.${ownerId}`;
}

function readMarks(ownerId: string): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(marksKey(ownerId)) ?? '{}') as unknown;
    if (typeof parsed !== 'object' || parsed == null) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
    );
  } catch {
    return {};
  }
}

/** For "Erase everything from this browser". */
export function clearAddonStorage(): void {
  try {
    for (const key of Object.keys(localStorage).filter((key) => key.startsWith('cvc.addon-instances.'))) {
      localStorage.removeItem(key);
    }
  } catch {
    // Not essential.
  }
}
