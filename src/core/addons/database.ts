/**
 * What the database add-ons share beyond the generic add-on page: the version
 * the provider reports against the ones Clever Cloud still offers.
 * PostgreSQL first; MySQL and MongoDB join these lists later.
 */
import type { AddonSummary } from '../../data/api.js';

/** Providers whose details carry a version, compared with the offered ones for "To watch". */
export const VERSIONED_PROVIDERS: readonly string[] = ['postgresql-addon'];

const PRODUCTS: Readonly<Record<string, string>> = { 'postgresql-addon': 'PostgreSQL' };

/** "PostgreSQL" for `postgresql-addon`: the summary of an add-on carries no provider name. */
export function databaseProduct(providerId: string): string {
  return PRODUCTS[providerId] ?? providerId.replace(/-addon$/, '');
}

/** "11", "15.4" → "11", "15": the offered versions are majors. */
export function majorVersion(version: string): string {
  return version.trim().split('.')[0];
}

/** Numeric order, "9" before "13". */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0 && !Number.isNaN(diff)) {
      return diff;
    }
  }
  return a.localeCompare(b);
}

/**
 * Older than every version Clever Cloud offers for a new database. A version
 * missing from the list but newer than its oldest entry is not called retired:
 * the list may simply lag behind.
 */
export function isRetiredVersion(version: string, offered: readonly string[]): boolean {
  if (version === '' || offered.length === 0) {
    return false;
  }
  const major = majorVersion(version);
  const oldest = [...offered].sort(compareVersions)[0];
  return !offered.includes(major) && compareVersions(major, oldest) < 0;
}

/** A database add-on on a version Clever Cloud no longer offers. */
export interface AddonWatchItem {
  kind: 'retired';
  addon: AddonSummary;
  version: string;
  /** The offered versions, oldest first. */
  offered: string[];
}

/** The add-ons of the "To watch" card: retired versions, oldest first, then by name. */
export function addonWatchList(
  addons: readonly AddonSummary[],
  version: (addon: AddonSummary) => string | null,
  offered: (providerId: string) => readonly string[] | null,
): AddonWatchItem[] {
  const items: AddonWatchItem[] = [];
  for (const addon of addons) {
    if (!VERSIONED_PROVIDERS.includes(addon.providerId)) {
      continue;
    }
    const current = version(addon);
    const versions = offered(addon.providerId);
    if (current != null && versions != null && isRetiredVersion(current, versions)) {
      items.push({ kind: 'retired', addon, version: current, offered: [...versions].sort(compareVersions) });
    }
  }
  return items.sort((a, b) => compareVersions(a.version, b.version) || a.addon.name.localeCompare(b.addon.name));
}
