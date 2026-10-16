/**
 * Endpoints and public identifiers shared with clever-tools (the official CLI).
 *
 * The OAuth consumer key/secret below are the ones embedded in clever-tools.
 * Clever Cloud states in the CLI source that their disclosure is not considered
 * a vulnerability: they only identify the "CLI" consumer, they grant nothing by
 * themselves. A user token + secret pair is still required for every call.
 */
export const API_HOST = 'https://api.clever-cloud.com';
export const API_BRIDGE_HOST = 'https://api-bridge.clever-cloud.com';
export const CONSOLE_URL = 'https://console.clever-cloud.com';

export const OAUTH_CONSUMER_KEY = 'T5nFjKeHH4AIlEveuGhB5S3xg8T19e';
export const OAUTH_CONSUMER_SECRET = 'MgVMqTr6fWlf2M0tkC2MXOnhfqBWDT';

/**
 * Version advertised to the Console on the `/cli-oauth` page, exactly like
 * `clever login` does. Kept in sync with the clever-tools release we mirror.
 */
export const CLI_VERSION = '5.2.0';

/** Key of the resource-id cache that `@clevercloud/client` keeps in localStorage. */
export const RESOURCE_ID_CACHE_KEY = 'cvc.resource-ids';
