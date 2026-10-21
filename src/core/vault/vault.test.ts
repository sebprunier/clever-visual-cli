import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vault } from './vault.js';

/** A Storage in memory, as a browser's. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
}

const SESSION_DATA_KEY = 'cvc.vault.session';

function profile(id: string, credentials: unknown) {
  return {
    id,
    alias: `${id}@example.com`,
    credentials,
    userId: `user_${id}`,
    email: `${id}@example.com`,
    createdAt: '',
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Vault', () => {
  it('drops the accounts stored with OAuth v1 credentials, and says how many', async () => {
    sessionStorage.setItem(
      SESSION_DATA_KEY,
      JSON.stringify({
        version: 1,
        profiles: [
          profile('oauth', { type: 'oauth-v1', token: 't', secret: 's' }),
          profile('token', { type: 'api-token', apiToken: 'a' }),
        ],
        activeProfileId: 'oauth',
      }),
    );
    const vault = await Vault.load();
    expect(vault.retired).toBe(1);
    expect(vault.profiles.map((stored) => stored.id)).toEqual(['token']);
    expect(vault.activeProfile?.id).toBe('token');
    // Written back, so the next load finds only the API token.
    expect(JSON.parse(sessionStorage.getItem(SESSION_DATA_KEY) ?? '{}').profiles).toHaveLength(1);
  });

  it('empties itself when only OAuth v1 accounts were stored', async () => {
    sessionStorage.setItem(
      SESSION_DATA_KEY,
      JSON.stringify({
        version: 1,
        profiles: [profile('oauth', { type: 'oauth-v1', token: 't', secret: 's' })],
        activeProfileId: 'oauth',
      }),
    );
    const vault = await Vault.load();
    expect(vault.retired).toBe(1);
    expect(vault.state).toBe('empty');
    expect(sessionStorage.getItem(SESSION_DATA_KEY)).toBeNull();
  });

  it('keeps API token accounts as they are', async () => {
    sessionStorage.setItem(
      SESSION_DATA_KEY,
      JSON.stringify({
        version: 1,
        profiles: [profile('token', { type: 'api-token', apiToken: 'a' })],
        activeProfileId: 'token',
      }),
    );
    const vault = await Vault.load();
    expect(vault.retired).toBe(0);
    expect(vault.state).toBe('unlocked');
    expect(vault.activeProfile?.id).toBe('token');
  });
});
