import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import type { AddonSummary } from '../../data/api.js';
import { addFavorite, NO_FAVORITES, readFavorites, writeFavorites } from '../home/favorites.js';
import { DEFAULT_PREFS, readPrefs } from '../home/prefs.js';
import { spaceKey, writeSpaces } from './sync-document.js';

// The platform behind the client: one configuration provider, its variables in memory.
const platform = vi.hoisted(() => ({
  variables: [] as Array<{ name: string; value: string }>,
  links: 0,
  writes: 0,
  created: 0,
  refuseCreation: false,
  /** The add-on was deleted from elsewhere: reading it fails, and the list no longer holds it. */
  deleted: false,
  /** Reading fails for another reason (the network): the add-on is still there. */
  unreachable: false,
}));
vi.mock('../../data/api.js', () => ({
  fetchConfigProviderEnvironment: async () => {
    if (platform.deleted) {
      throw new Error('[404]: not found');
    }
    if (platform.unreachable) {
      throw new Error('Failed to fetch');
    }
    return platform.variables;
  },
  addonExists: async () => {
    if (platform.unreachable) {
      throw new Error('Failed to fetch');
    }
    return !platform.deleted;
  },
  replaceConfigProviderEnvironment: async (
    _client: unknown,
    _realId: string,
    environment: typeof platform.variables,
  ) => {
    platform.writes += 1;
    platform.variables = environment;
    return environment;
  },
  countLinkedApplications: async () => platform.links,
  createConfigProvider: async () => {
    if (platform.refuseCreation) {
      throw new Error('[403]: not allowed');
    }
    platform.created += 1;
    return { id: 'addon_sync', realId: 'config_sync' };
  },
}));

vi.mock('../clever-client.js', () => ({
  describeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

const { MAX_BODY_BYTES, SyncStore } = await import('./sync-store.js');

const client = {} as CcApiClient;
const USER = 'user_1';
const ORGA = 'orga_1';
const SYNC_ADDON = {
  id: 'addon_sync',
  realId: 'config_sync',
  providerId: 'config-provider',
  name: 'clever-visual-cli',
} as AddonSummary;
const VIEW = { filter: 'env:prod', grouping: '', sort: DEFAULT_PREFS.sort };

/** A localStorage in memory whose stored keys `Object.keys()` lists, as a browser's does. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  const storage = {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
  return new Proxy(storage, {
    ownKeys: () => [...items.keys()],
    getOwnPropertyDescriptor: (target, key) =>
      typeof key === 'string' && items.has(key)
        ? { enumerable: true, configurable: true, value: items.get(key) }
        : Reflect.getOwnPropertyDescriptor(target, key),
  }) as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  platform.variables = [];
  platform.links = 0;
  platform.writes = 0;
  platform.created = 0;
  platform.refuseCreation = false;
  platform.deleted = false;
  platform.unreachable = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SyncStore', () => {
  it('stays off without the add-on, and creates it only when enabled', async () => {
    const store = new SyncStore();
    store.attach(client, USER, []);
    expect(store.state).toBe('off');
    expect(platform.created).toBe(0);
    const created = vi.fn();
    store.addEventListener('created', created);
    writeFavorites(ORGA, addFavorite(NO_FAVORITES, 'prod', VIEW, 10, 'a'));
    await store.enable();
    expect(platform.created).toBe(1);
    expect(created).toHaveBeenCalledTimes(1);
    expect(store.state).toBe('on');
    expect(platform.variables.map((variable) => variable.name)).toContain(spaceKey(ORGA));
  });

  it('stays off when the creation fails, until "Not now" dismisses the offer', async () => {
    platform.refuseCreation = true;
    const store = new SyncStore();
    store.attach(client, USER, []);
    await store.enable();
    expect(store.state).toBe('off');
    expect(store.error).toContain('403');
    store.decline();
    expect(store.declined).toBe(true);
    expect(store.error).toBeNull();
  });

  it('goes off when the add-on is deleted from elsewhere, and can be enabled again (#19)', async () => {
    const store = new SyncStore();
    store.attach(client, USER, [SYNC_ADDON]);
    await store.syncNow();
    expect(store.state).toBe('on');
    platform.deleted = true;
    await store.syncNow();
    expect(store.state).toBe('off');
    expect(store.lost).toBe(true);
    expect(store.addon).toBeNull();
    expect(store.error).toBeNull();
    platform.deleted = false;
    await store.enable();
    expect(store.state).toBe('on');
    expect(store.lost).toBe(false);
  });

  it('notices the deletion when a refreshed summary no longer lists the add-on (#19)', async () => {
    const store = new SyncStore();
    store.attach(client, USER, [SYNC_ADDON]);
    await store.syncNow();
    platform.deleted = true;
    store.attach(client, USER, []);
    await store.syncNow();
    expect(store.state).toBe('off');
    expect(store.lost).toBe(true);
  });

  it('stays on, with the error, when the add-on cannot be reached but is still there', async () => {
    const store = new SyncStore();
    store.attach(client, USER, [SYNC_ADDON]);
    await store.syncNow();
    platform.unreachable = true;
    await store.syncNow();
    expect(store.state).toBe('on');
    expect(store.lost).toBe(false);
    expect(store.error).toBe('Failed to fetch');
  });

  it('brings another browser the views it finds in the add-on', async () => {
    platform.variables = writeSpaces(
      [],
      [
        {
          ownerId: ORGA,
          prefs: { ...DEFAULT_PREFS, grouping: 'project', updatedAt: 5 },
          favorites: addFavorite(NO_FAVORITES, 'prod', VIEW, 6, 'a'),
        },
      ],
    );
    const store = new SyncStore();
    const applied: string[][] = [];
    store.addEventListener('applied', (event) =>
      applied.push((event as CustomEvent<{ owners: string[] }>).detail.owners),
    );
    store.attach(client, USER, [SYNC_ADDON]);
    await store.syncNow();
    expect(readPrefs(ORGA).grouping).toBe('project');
    expect(readFavorites(ORGA).views.map((view) => view.name)).toEqual(['prod']);
    expect(applied.at(-1)).toEqual([ORGA]);
    expect(platform.writes).toBe(0);
  });

  it('writes a local change a moment later, after a fresh read', async () => {
    const store = new SyncStore();
    store.attach(client, USER, [SYNC_ADDON]);
    await store.syncNow();
    vi.useFakeTimers();
    writeFavorites(ORGA, addFavorite(NO_FAVORITES, 'prod', VIEW, Date.now(), 'a'));
    expect(platform.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(2500);
    expect(platform.writes).toBe(1);
    expect(platform.variables.map((variable) => variable.name)).toContain(spaceKey(ORGA));
  });

  it('refuses a write larger than the platform takes', async () => {
    // Accents count twice: the platform's limit is in bytes.
    const filter = 'é'.repeat(MAX_BODY_BYTES / 2);
    writeFavorites(ORGA, addFavorite(NO_FAVORITES, 'huge', { ...VIEW, filter }, 10, 'a'));
    const store = new SyncStore();
    store.attach(client, USER, [SYNC_ADDON]);
    await store.syncNow();
    expect(platform.writes).toBe(0);
    expect(store.error).not.toBeNull();
  });

  it('refuses to write while the add-on is linked to an application', async () => {
    platform.links = 1;
    writeFavorites(ORGA, addFavorite(NO_FAVORITES, 'prod', VIEW, 10, 'a'));
    const store = new SyncStore();
    store.attach(client, USER, [SYNC_ADDON]);
    await store.syncNow();
    expect(platform.writes).toBe(0);
    expect(store.error).not.toBeNull();
  });
});
