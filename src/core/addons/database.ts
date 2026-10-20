/**
 * What the database add-ons share beyond the generic add-on page: the version
 * the provider reports against the ones Clever Cloud still offers, and the
 * commands that bring a backup back. PostgreSQL first; MySQL and MongoDB join
 * these lists when their tabs are written.
 */
import type { AddonSummary } from '../../data/api.js';
import { shellQuote } from '../shell.js';

/** Providers whose details carry a version, compared with the offered ones for "To watch". */
export const VERSIONED_PROVIDERS: readonly string[] = ['postgresql-addon'];

/** Providers with a Backups tab. */
export const BACKUP_PROVIDERS: readonly string[] = ['postgresql-addon'];

const PRODUCTS: Readonly<Record<string, string>> = { 'postgresql-addon': 'PostgreSQL' };

/** The variable that holds the password a restore command asks for. */
export const PASSWORD_VARIABLES: Readonly<Record<string, string>> = { 'postgresql-addon': 'POSTGRESQL_ADDON_PASSWORD' };

/** "PostgreSQL" for `postgresql-addon`: the summary of an add-on carries no provider name. */
export function databaseProduct(providerId: string): string {
  return PRODUCTS[providerId] ?? providerId.replace(/-addon$/, '');
}

/** What a restore command needs from the add-on's details; never its password. */
export interface ConnectionTarget {
  host: string;
  port: number;
  user: string;
  database: string;
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

/** "15.4" at the precision of "13" is "15"; "7.0.11" at the precision of "8.10.2" stays itself. */
function atPrecisionOf(version: string, entry: string): string {
  return version.trim().split('.').slice(0, entry.split('.').length).join('.');
}

/**
 * Older than every version Clever Cloud offers for a new database, compared at
 * the precision of the offered list: majors for PostgreSQL ("11" against "13"),
 * "5.7" for MySQL, "8.10.2" for Redis. A version missing from the list but
 * newer than its oldest entry is not called retired: the list may lag behind.
 */
export function isRetiredVersion(version: string, offered: readonly string[]): boolean {
  if (version.trim() === '' || offered.length === 0) {
    return false;
  }
  if (offered.some((entry) => atPrecisionOf(version, entry) === entry)) {
    return false;
  }
  const oldest = [...offered].sort(compareVersions)[0];
  return compareVersions(atPrecisionOf(version, oldest), oldest) < 0;
}

/** The command that loads a downloaded backup into the database, for the providers that have one. */
export function restoreCommand(providerId: string, target: ConnectionTarget, file: string): string | null {
  if (providerId !== 'postgresql-addon') {
    return null;
  }
  // The flags of the client's own template (ListBackupCommand), with the real file name.
  return [
    'pg_restore',
    `-h ${shellQuote(target.host)}`,
    `-p ${target.port}`,
    `-U ${shellQuote(target.user)}`,
    `-d ${shellQuote(target.database)}`,
    '--no-owner --no-privileges --no-comments --format=c',
    shellQuote(file),
  ].join(' ');
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
