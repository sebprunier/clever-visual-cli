/**
 * The sync of #1: the display preferences and favourite views of every space,
 * kept in the configuration provider `clever-visual-cli` of the user's
 * personal space, so another browser signed in to the same account finds
 * them. No backend, no other secret than the token the app already has.
 *
 * - Found at sign-in when it exists: the sync is on, no question asked.
 * - Created only when the user enables it (`clever addon create
 *   config-provider clever-visual-cli`), never silently.
 * - Read at start and on demand; written a couple of seconds after the last
 *   local change, always after a fresh read, so what another browser wrote to
 *   other spaces stays. Each part of a space keeps its newest copy.
 * - Never written while the add-on is linked to an application: Clever Cloud
 *   would redeploy it on each change.
 *
 * - Off again when the add-on is deleted from elsewhere (the Console, `clever addon
 *   delete`): a read or write that fails checks it is still there.
 *
 * Emits `change` when its state changes, `created` once it created the add-on
 * and `applied` (with the owners) when spaces were updated from another
 * browser.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import {
  addonExists,
  countLinkedApplications,
  createConfigProvider,
  fetchConfigProviderEnvironment,
  replaceConfigProviderEnvironment,
  type AddonSummary,
} from '../../data/api.js';
import { describeError } from '../clever-client.js';
import { readFavorites, saveFavorites } from '../home/favorites.js';
import { knownOwners, localChanges, type LocalChangeDetail } from '../home/local-changes.js';
import { readPrefs, savePrefs } from '../home/prefs.js';
import { t } from '../i18n.js';
import { isSyncAddon, SYNC_ADDON_NAME, SYNC_PROVIDER } from './sync-addon.js';
import { mergeSpace, readSpaces, writeSpaces, type SpaceDocument } from './sync-document.js';

export { isSyncAddon, SYNC_ADDON_NAME, SYNC_PROVIDER };

/** The command that does what "Enable" does. */
export const SYNC_CREATE_COMMAND = `clever addon create ${SYNC_PROVIDER} ${SYNC_ADDON_NAME}`;

const WRITE_AFTER = 2000;
/**
 * The largest write, in UTF-8 bytes of the whole variable list: the platform refuses a request
 * body over about 5 MB (413, measured in October 2026), whatever the size of each variable.
 */
export const MAX_BODY_BYTES = 4_000_000;
const DECLINED_KEY = 'cvc.sync.declined';

/** `off`: no add-on (yet); `enabling`: being created; `on`: synced through it. */
export type SyncState = 'idle' | 'off' | 'enabling' | 'on';

export interface SyncAppliedDetail {
  owners: string[];
}

export class SyncStore extends EventTarget {
  state: SyncState = 'idle';
  addon: { id: string; realId: string } | null = null;
  /** A read or write in progress. */
  busy = false;
  lastSyncAt: number | null = null;
  error: string | null = null;
  /** The add-on was deleted from elsewhere, so the sync went off (#19). */
  lost = false;

  #client: CcApiClient | null = null;
  /** The personal space, owner of the add-on. */
  #userId = '';
  #pending = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #queue: Promise<void> = Promise.resolve();

  constructor() {
    super();
    localChanges.addEventListener('change', (event) =>
      this.#onLocalChange((event as CustomEvent<LocalChangeDetail>).detail.ownerId),
    );
  }

  /** At sign-in and when the summary changes: an add-on found in the personal space switches the sync on. */
  attach(client: CcApiClient, userId: string, personalAddons: readonly AddonSummary[]): void {
    const found = personalAddons.find((addon) => isSyncAddon(userId, addon));
    if (this.#client === client && this.#userId === userId && (found == null || this.addon?.id === found.id)) {
      if (found == null && this.addon != null && this.state === 'on' && !this.busy) {
        // Gone from the summary: deleted elsewhere, or created a moment ago and not listed yet. A read tells.
        void this.syncNow();
      }
      return;
    }
    if (this.#userId !== userId) {
      // Another account: nothing of the previous one's add-on applies.
      clearTimeout(this.#timer);
      this.#pending.clear();
      this.addon = null;
      this.lastSyncAt = null;
      this.lost = false;
    }
    this.#client = client;
    this.#userId = userId;
    this.error = null;
    if (found == null) {
      // Being created, or created a moment ago and not yet in the summary: keep it.
      if (this.state !== 'enabling' && this.addon == null) {
        this.#setState('off');
      }
      return;
    }
    this.addon = { id: found.id, realId: found.realId };
    this.#setState('on');
    void this.syncNow();
  }

  /** At sign-out or when the account changes. */
  detach(): void {
    clearTimeout(this.#timer);
    this.#pending.clear();
    this.#client = null;
    this.#userId = '';
    this.addon = null;
    this.lastSyncAt = null;
    this.error = null;
    this.lost = false;
    this.#setState('idle');
  }

  /** The personal space that holds the add-on. */
  get ownerId(): string {
    return this.#userId;
  }

  /** "Not now": the offer is not made again; the accounts page still enables it. */
  get declined(): boolean {
    try {
      return localStorage.getItem(DECLINED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  decline(): void {
    try {
      localStorage.setItem(DECLINED_KEY, 'true');
    } catch {
      // Not essential: the offer comes back.
    }
    if (this.state === 'off') {
      this.error = null;
    }
    this.#emit('change');
  }

  /** Creates the add-on in the personal space, after the user said so, then writes what this browser has. */
  async enable(): Promise<void> {
    const client = this.#client;
    if (client == null || this.addon != null || this.state === 'enabling') {
      return;
    }
    this.error = null;
    this.lost = false;
    this.#setState('enabling');
    try {
      this.addon = await createConfigProvider(client, this.#userId, SYNC_ADDON_NAME);
      this.#setState('on');
      this.#emit('created');
      await this.syncNow();
    } catch (error) {
      this.error = describeError(error);
      this.#setState('off');
    }
  }

  /** Reads every space, takes what is newer elsewhere, writes what is newer here. */
  syncNow(): Promise<void> {
    return this.#enqueue(() => this.#sync(knownOwners(), true));
  }

  #onLocalChange(ownerId: string): void {
    if (this.state !== 'on') {
      return;
    }
    this.#pending.add(ownerId);
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      const owners = [...this.#pending];
      this.#pending.clear();
      void this.#enqueue(() => this.#sync(owners, false));
    }, WRITE_AFTER);
  }

  /** One read-merge-write at a time. */
  #enqueue(task: () => Promise<void>): Promise<void> {
    this.#queue = this.#queue.then(task, task);
    return this.#queue;
  }

  async #sync(owners: string[], everything: boolean): Promise<void> {
    const client = this.#client;
    const addon = this.addon;
    if (client == null || addon == null) {
      return;
    }
    this.busy = true;
    this.#emit('change');
    try {
      const variables = await fetchConfigProviderEnvironment(client, addon.realId);
      const remote = readSpaces(variables);
      const candidates = everything ? new Set([...owners, ...remote.keys()]) : new Set(owners);
      const applied: string[] = [];
      const toWrite: SpaceDocument[] = [];
      for (const ownerId of candidates) {
        const local: SpaceDocument = { ownerId, prefs: readPrefs(ownerId), favorites: readFavorites(ownerId) };
        const { merged, localChanged, remoteChanged } = mergeSpace(local, remote.get(ownerId));
        if (localChanged) {
          savePrefs(ownerId, merged.prefs);
          saveFavorites(ownerId, merged.favorites);
          applied.push(ownerId);
        }
        if (remoteChanged) {
          toWrite.push(merged);
        }
      }
      if (toWrite.length > 0) {
        const next = writeSpaces(variables, toWrite);
        if (new TextEncoder().encode(JSON.stringify(next)).length > MAX_BODY_BYTES) {
          throw new Error(t('sync.tooLarge'));
        }
        const linked = await countLinkedApplications(client, this.#userId, addon.id);
        if (linked > 0) {
          throw new Error(t('sync.linked', { count: linked }));
        }
        await replaceConfigProviderEnvironment(client, addon.realId, next);
      }
      this.lastSyncAt = Date.now();
      this.error = null;
      if (applied.length > 0) {
        this.#emit('applied', { owners: applied });
      }
    } catch (error) {
      if (await this.#gone(client, addon.id)) {
        this.#lose();
      } else {
        this.error = describeError(error);
      }
    } finally {
      this.busy = false;
      this.#emit('change');
    }
  }

  /** Whether the add-on was deleted; false when that cannot be told (the network, for instance). */
  async #gone(client: CcApiClient, addonId: string): Promise<boolean> {
    try {
      return !(await addonExists(client, this.#userId, addonId));
    } catch {
      return false;
    }
  }

  /** The add-on is gone: the sync goes off, and can be enabled again. What this browser has stays. */
  #lose(): void {
    clearTimeout(this.#timer);
    this.#pending.clear();
    this.addon = null;
    this.lastSyncAt = null;
    this.error = null;
    this.lost = true;
    this.#setState('off');
  }

  #setState(state: SyncState): void {
    this.state = state;
    this.#emit('change');
  }

  #emit(name: 'change' | 'created'): void;
  #emit(name: 'applied', detail: SyncAppliedDetail): void;
  #emit(name: string, detail?: SyncAppliedDetail): void {
    this.dispatchEvent(detail == null ? new Event(name) : new CustomEvent(name, { detail }));
  }
}
