/**
 * What the user hands us to talk to the API: an API token, created in the
 * Console (Profile → API tokens) or with `clever tokens create`, sent as a
 * Bearer header to api-bridge.clever-cloud.com. Revocable, expirable, and
 * created for this purpose, so the calls carry an identity of their own.
 *
 * OAuth v1 (the Console flow and the token/secret pair `clever login` stores)
 * is not accepted: it would borrow the identity of clever-tools (#14).
 */
export interface Credentials {
  type: 'api-token';
  apiToken: string;
}

/** True for credentials still accepted; older stored accounts may hold OAuth v1 ones. */
export function isAcceptedCredentials(value: unknown): value is Credentials {
  const credentials = value as Partial<Credentials> | null;
  return credentials?.type === 'api-token' && typeof credentials.apiToken === 'string' && credentials.apiToken !== '';
}
