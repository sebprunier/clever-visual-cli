/**
 * The version check of each operator of an organisation (installed, latest,
 * whether an update is out), read after the home list for the "To watch"
 * card. One call per operator, kept a day in localStorage
 * (`cvc.operator-versions.<ownerId>`), so a reload asks nothing. Emits `change`.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { fetchOperatorVersions, type OperatorVersions } from '../../data/api.js';
import { operatorKind } from '../addons/operator.js';

const KEEP_FOR = 24 * 60 * 60_000;
const PREFIX = 'cvc.operator-versions.';

interface Dated {
  value: OperatorVersions;
  at: number;
}

export class OperatorVersionStore extends EventTarget {
  #owners = new Map<string, Record<string, Dated>>();
  #running = new Set<string>();

  /** The version check of an operator, null while unknown. */
  versions(ownerId: string, addonId: string): OperatorVersions | null {
    return this.#owner(ownerId)[addonId]?.value ?? null;
  }

  /** A check made elsewhere (the add-on page), kept as a fresh one. */
  remember(ownerId: string, addonId: string, versions: OperatorVersions): void {
    this.#owner(ownerId)[addonId] = { value: versions, at: Date.now() };
    this.#save(ownerId);
    this.#emit();
  }

  /** Checks the operators not checked for a day. */
  async refresh(
    client: CcApiClient,
    ownerId: string,
    addons: ReadonlyArray<{ id: string; realId: string; providerId: string }>,
  ): Promise<void> {
    if (this.#running.has(ownerId)) {
      return;
    }
    const now = Date.now();
    const known = this.#owner(ownerId);
    const todo = addons.filter(
      (addon) =>
        operatorKind(addon.providerId) != null && (known[addon.id] == null || now - known[addon.id].at > KEEP_FOR),
    );
    if (todo.length === 0) {
      return;
    }
    this.#running.add(ownerId);
    try {
      await Promise.all(
        todo.map(async (addon) => {
          try {
            const kind = operatorKind(addon.providerId);
            if (kind != null) {
              known[addon.id] = { value: await fetchOperatorVersions(client, kind, addon.realId), at: Date.now() };
            }
          } catch {
            // Not essential: the operator just stays out of "To watch" until next time.
          }
        }),
      );
      this.#save(ownerId);
    } finally {
      this.#running.delete(ownerId);
      this.#emit();
    }
  }

  forget(): void {
    this.#owners.clear();
    this.#emit();
  }

  #owner(ownerId: string): Record<string, Dated> {
    let entries = this.#owners.get(ownerId);
    if (entries == null) {
      entries = readFresh(PREFIX + ownerId);
      this.#owners.set(ownerId, entries);
    }
    return entries;
  }

  #save(ownerId: string): void {
    try {
      localStorage.setItem(PREFIX + ownerId, JSON.stringify(this.#owner(ownerId)));
    } catch {
      // Not essential: asked again next time.
    }
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}

/** The entries of a stored map younger than a day. */
function readFresh(key: string): Record<string, Dated> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Partial<Dated>> | null;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed ?? {}).filter(
        (entry): entry is [string, Dated] =>
          typeof entry[1]?.at === 'number' &&
          now - entry[1].at < KEEP_FOR &&
          typeof entry[1].value?.installed === 'string' &&
          typeof entry[1].value?.needUpdate === 'boolean',
      ),
    );
  } catch {
    return {};
  }
}

/** For "Erase everything from this browser". */
export function clearOperatorVersionStorage(): void {
  try {
    for (const key of Object.keys(localStorage).filter((key) => key.startsWith(PREFIX))) {
      localStorage.removeItem(key);
    }
  } catch {
    // Not essential.
  }
}
