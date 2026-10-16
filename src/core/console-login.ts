import { API_HOST, CLI_VERSION, CONSOLE_URL } from './constants.js';
import type { Credentials } from './credentials.js';

/**
 * Reproduces `clever login` in the browser.
 *
 * 1. Generate a random `cli_token`.
 * 2. Open the Console on `/cli-oauth` with it: the user authorises "the CLI".
 * 3. Poll `GET /v2/self/cli_tokens?cli_token=…` (unauthenticated) until the
 *    Console has attached an OAuth v1 token/secret pair to our random token.
 *
 * `window.open` runs synchronously before the first `await`, so the call must
 * happen directly inside a user gesture handler to escape popup blockers.
 */

const POLLING_INTERVAL_MS = 2000;
const POLLING_MAX_TRIES = 60;

interface ConsoleLoginOptions {
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
}

interface CliTokenResponse {
  token: string;
  secret: string;
  expirationDate?: string;
}

export function loginViaConsole(options: ConsoleLoginOptions = {}): Promise<Credentials> {
  const cliToken = randomToken();

  const consoleUrl = new URL('/cli-oauth', CONSOLE_URL);
  consoleUrl.searchParams.set('cli_version', CLI_VERSION);
  consoleUrl.searchParams.set('cli_token', cliToken);

  const pollUrl = new URL('/v2/self/cli_tokens', API_HOST);
  pollUrl.searchParams.set('cli_token', cliToken);

  const popup = window.open(consoleUrl.toString(), 'cvc-console-login', 'popup,width=640,height=760');
  if (popup == null) {
    return Promise.reject(new Error('Le navigateur a bloqué la fenêtre de connexion à la Console.'));
  }

  return pollCliToken(pollUrl, popup, options);
}

async function pollCliToken(
  pollUrl: URL,
  popup: Window,
  { signal, onStatus }: ConsoleLoginOptions,
): Promise<Credentials> {
  try {
    for (let tryCount = 0; tryCount < POLLING_MAX_TRIES; tryCount += 1) {
      signal?.throwIfAborted();
      if (tryCount > 0 && tryCount % 10 === 0) {
        onStatus?.('En attente de la fin de la connexion dans la fenêtre de la Console…');
      }

      const response = await fetch(pollUrl, { signal });
      if (response.status === 404) {
        await delay(POLLING_INTERVAL_MS, signal);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Réponse inattendue de l'API pendant la connexion (HTTP ${response.status}).`);
      }

      const data = (await response.json()) as CliTokenResponse;
      if (typeof data.token !== 'string' || typeof data.secret !== 'string') {
        throw new Error("Réponse inattendue de l'API : token ou secret absent.");
      }
      return { type: 'oauth-v1', token: data.token, secret: data.secret, expirationDate: data.expirationDate };
    }
    throw new Error("La connexion via la Console n'a pas abouti dans le temps imparti.");
  } finally {
    if (!popup.closed) {
      popup.close();
    }
  }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // Same alphabet as clever-tools: base64 made URL-safe, padding stripped.
  return btoa(binary).replace(/\//g, '-').replace(/\+/g, '_').replace(/=/g, '');
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
