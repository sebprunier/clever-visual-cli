/**
 * The clever-tools release the commands on screen are checked against
 * (`CLI_VERSION`) and the latest one published on npm. The registry is public
 * and answers any origin; it is read at most once a day, the answer kept in
 * localStorage (`cvc.cli-release`).
 */
import { CLI_VERSION } from './constants.js';

const KEY = 'cvc.cli-release';
const KEEP_FOR = 24 * 60 * 60_000;
const REGISTRY_URL = 'https://registry.npmjs.org/clever-tools/latest';

interface Stored {
  version: string;
  at: number;
}

/** Numeric order of `x.y.z`; a pre-release suffix is ignored. */
export function compareReleases(a: string, b: string): number {
  const parse = (version: string) =>
    version
      .split('-')[0]
      .split('.')
      .map((part) => Number(part) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** A published release newer than the one the commands are checked against. */
export function isNewerRelease(latest: string | null, current = CLI_VERSION): boolean {
  return latest != null && compareReleases(latest, current) > 0;
}

export function releaseNotesUrl(version: string): string {
  return `https://github.com/CleverCloud/clever-tools/releases/tag/${encodeURIComponent(version)}`;
}

function readStored(): Stored | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
    return typeof parsed?.version === 'string' && typeof parsed.at === 'number'
      ? { version: parsed.version, at: parsed.at }
      : null;
  } catch {
    return null;
  }
}

/** The latest release, read again from the registry when the stored one is a day old; null when unknown. */
export async function latestRelease(fetcher: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  const stored = readStored();
  if (stored != null && now - stored.at < KEEP_FOR) {
    return stored.version;
  }
  try {
    const response = await fetcher(REGISTRY_URL, { headers: { Accept: 'application/json' } });
    const body = (await response.json()) as { version?: unknown };
    if (!response.ok || typeof body.version !== 'string') {
      return stored?.version ?? null;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: body.version, at: now }));
    } catch {
      // Not essential: asked again next time.
    }
    return body.version;
  } catch {
    // Offline or blocked: the warning just waits.
    return stored?.version ?? null;
  }
}

export function clearCliReleaseStorage(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
