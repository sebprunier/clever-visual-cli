import { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { LocalStorageStore } from '@clevercloud/client/cc-api-local-storage-store.js';
import { RESOURCE_ID_CACHE_KEY } from './constants.js';
import type { Credentials } from './credentials.js';

/**
 * Builds the `@clevercloud/client` command client for an API token: the client
 * sends every call to api-bridge.clever-cloud.com with it as a Bearer header.
 */
export function createClient(credentials: Credentials): CcApiClient {
  return new CcApiClient({
    authMethod: { type: 'api-token', apiToken: credentials.apiToken },
    // The client defaults to `mode: 'same-origin'` on fetch, which a browser
    // rejects for a cross-origin URL before any request leaves. Both API hosts
    // answer CORS preflights for any origin, so opt in explicitly.
    defaultRequestConfig: { isCorsEnabled: true },
    resourceIdResolverStore: new LocalStorageStore(RESOURCE_ID_CACHE_KEY),
  });
}

/** Drops every cache the client left in the browser (called on logout). */
export function clearClientCaches(): void {
  try {
    localStorage.removeItem(RESOURCE_ID_CACHE_KEY);
  } catch {
    // Storage unavailable: nothing was cached anyway.
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
