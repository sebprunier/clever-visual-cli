/**
 * The version of each database add-on of an organisation and the versions
 * Clever Cloud still offers, read after the home list for the "To watch" card.
 * A version only changes through a migration: each one is kept a day in
 * localStorage (`cvc.db-versions.<ownerId>`), the offered ones too
 * (`cvc.db-versions.offered`), so a reload asks nothing. Emits `change`.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { fetchDatabaseDetails, fetchOfferedVersions } from '../../data/api.js';
import { VERSIONED_PROVIDERS } from '../addons/database.js';

const KEEP_FOR = 24 * 60 * 60_000;
const CONCURRENCY = 6;
const PREFIX = 'cvc.db-versions.';
const OFFERED_KEY = `${PREFIX}offered`;

interface Dated<T> {
  value: T;
  at: number;
}

export class DbVersionStore extends EventTarget {
  #versions = new Map<string, Record<string, Dated<string>>>();
  #offered: Record<string, Dated<string[]>> | null = null;
  #running = new Set<string>();

  /** The version of a database add-on, null while unknown. */
  version(ownerId: string, addonId: string): string | null {
    return this.#owner(ownerId)[addonId]?.value ?? null;
  }

  /** The versions offered for a new database of this provider, null while unknown. */
  offered(providerId: string): string[] | null {
    return this.#offeredAll()[providerId]?.value ?? null;
  }

  /** A version read elsewhere (the add-on page), kept as a fresh one. */
  remember(ownerId: string, addonId: string, version: string): void {
    if (this.version(ownerId, addonId) === version) {
      return;
    }
    this.#owner(ownerId)[addonId] = { value: version, at: Date.now() };
    this.#save(PREFIX + ownerId, this.#owner(ownerId));
    this.#emit();
  }

  /** Reads the versions not known for a day, and the offered ones of the providers met. */
  async refresh(
    client: CcApiClient,
    ownerId: string,
    addons: ReadonlyArray<{ id: string; providerId: string }>,
  ): Promise<void> {
    if (this.#running.has(ownerId)) {
      return;
    }
    const now = Date.now();
    const known = this.#owner(ownerId);
    const databases = addons.filter((addon) => VERSIONED_PROVIDERS.includes(addon.providerId));
    const todo = databases.filter((addon) => known[addon.id] == null || now - known[addon.id].at > KEEP_FOR);
    const providers = [...new Set(databases.map((addon) => addon.providerId))].filter((id) => this.offered(id) == null);
    if (todo.length === 0 && providers.length === 0) {
      return;
    }
    this.#running.add(ownerId);
    try {
      await Promise.all(providers.map((providerId) => this.ensureOffered(client, providerId)));
      let next = 0;
      const worker = async () => {
        while (next < todo.length) {
          const addon = todo[next++];
          try {
            const details = await fetchDatabaseDetails(client, addon.providerId, addon.id);
            known[addon.id] = { value: details.version, at: Date.now() };
          } catch {
            // Not essential: the add-on just stays out of "To watch" until next time.
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
      this.#save(PREFIX + ownerId, known);
    } finally {
      this.#running.delete(ownerId);
      this.#emit();
    }
  }

  /** The offered versions of a provider, read when unknown for a day. */
  async ensureOffered(client: CcApiClient, providerId: string): Promise<void> {
    if (this.offered(providerId) != null) {
      return;
    }
    try {
      const { versions } = await fetchOfferedVersions(client, providerId);
      const all = this.#offeredAll();
      all[providerId] = { value: versions, at: Date.now() };
      this.#save(OFFERED_KEY, all);
      this.#emit();
    } catch {
      // Not essential: nothing is called retired without the list.
    }
  }

  forget(): void {
    this.#versions.clear();
    this.#offered = null;
    this.#emit();
  }

  #owner(ownerId: string): Record<string, Dated<string>> {
    let entries = this.#versions.get(ownerId);
    if (entries == null) {
      entries = readFresh<string>(PREFIX + ownerId, (value) => typeof value === 'string');
      this.#versions.set(ownerId, entries);
    }
    return entries;
  }

  #offeredAll(): Record<string, Dated<string[]>> {
    this.#offered ??= readFresh<string[]>(OFFERED_KEY, (value) => Array.isArray(value));
    return this.#offered;
  }

  #save(key: string, entries: Record<string, Dated<unknown>>): void {
    try {
      localStorage.setItem(key, JSON.stringify(entries));
    } catch {
      // Not essential: asked again next time.
    }
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}

/** The entries of a stored map younger than a day. */
function readFresh<T>(key: string, valid: (value: unknown) => boolean): Record<string, Dated<T>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown;
    if (typeof parsed !== 'object' || parsed == null) {
      return {};
    }
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed as Record<string, Dated<unknown>>).filter(
        (entry): entry is [string, Dated<T>] =>
          typeof entry[1]?.at === 'number' && now - entry[1].at < KEEP_FOR && valid(entry[1].value),
      ),
    );
  } catch {
    return {};
  }
}

/** For "Erase everything from this browser". */
export function clearDbVersionStorage(): void {
  try {
    for (const key of Object.keys(localStorage).filter((key) => key.startsWith(PREFIX))) {
      localStorage.removeItem(key);
    }
  } catch {
    // Not essential.
  }
}
