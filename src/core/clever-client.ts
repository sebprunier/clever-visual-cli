import { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { LocalStorageStore } from '@clevercloud/client/cc-api-local-storage-store.js';
import { OAUTH_CONSUMER_KEY, OAUTH_CONSUMER_SECRET, RESOURCE_ID_CACHE_KEY } from './constants.js';
import type { Credentials } from './credentials.js';

type CcApiClientConfig = NonNullable<ConstructorParameters<typeof CcApiClient>[0]>;
type CcApiAuth = NonNullable<CcApiClientConfig['authMethod']>;

/**
 * Builds the `@clevercloud/client` command client for a set of credentials.
 * The client picks the right host by itself: api-bridge for API tokens,
 * api.clever-cloud.com for OAuth v1.
 */
export function createClient(credentials: Credentials): CcApiClient {
  const authMethod: CcApiAuth =
    credentials.type === 'api-token'
      ? { type: 'api-token', apiToken: credentials.apiToken }
      : {
          type: 'oauth-v1',
          oauthTokens: {
            consumerKey: OAUTH_CONSUMER_KEY,
            consumerSecret: OAUTH_CONSUMER_SECRET,
            token: credentials.token,
            secret: credentials.secret,
          },
        };

  return new CcApiClient({
    authMethod,
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
