/** The Clever Cloud hosts the interface names, and the clever-tools release its commands follow. */
export const API_HOST = 'https://api.clever-cloud.com';
export const API_BRIDGE_HOST = 'https://api-bridge.clever-cloud.com';
export const CONSOLE_URL = 'https://console.clever-cloud.com';

/** This version of clever-visual-cli, from package.json, and its GitHub release. */
export const APP_VERSION = __CVC_VERSION__;
export const APP_RELEASE_URL = `https://github.com/sebprunier/clever-visual-cli/releases/tag/v${APP_VERSION}`;

/** The clever-tools release the commands shown on screen are checked against. */
export const CLI_VERSION = '5.2.0';

/** Key of the resource-id cache that `@clevercloud/client` keeps in localStorage. */
export const RESOURCE_ID_CACHE_KEY = 'cvc.resource-ids';
