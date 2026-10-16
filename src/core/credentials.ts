/**
 * What the user hands us to talk to the API.
 *
 * - `api-token`: a token created in the Console (or with `clever tokens create`),
 *   sent as a Bearer header to api-bridge.clever-cloud.com. Revocable, expirable.
 * - `oauth-v1`: the token/secret pair `clever login` stores in
 *   ~/.config/clever-cloud/clever-tools.json, used against api.clever-cloud.com
 *   with the public clever-tools consumer.
 */
export type Credentials =
  | { type: 'api-token'; apiToken: string }
  | { type: 'oauth-v1'; token: string; secret: string; expirationDate?: string };

export interface CredentialsStore {
  read(): Credentials | null;
  write(credentials: Credentials): void;
  clear(): void;
}

const SESSION_KEY = 'cvc.credentials';

/**
 * Phase 0 store: sessionStorage only. Survives a reload, dies with the tab.
 * Phase 1 replaces it with an encrypted localStorage store (passphrase / passkey).
 */
export const sessionCredentialsStore: CredentialsStore = {
  read() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw == null ? null : (JSON.parse(raw) as Credentials);
    } catch {
      return null;
    }
  },
  write(credentials) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(credentials));
    } catch {
      // Private mode or blocked storage: the session simply won't survive a reload.
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
