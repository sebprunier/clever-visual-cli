/**
 * The format of the sync (#1): what the home page remembers per space
 * (organisation or personal space), kept as variables of a configuration
 * provider in the user's personal space, so another browser signed in to the
 * same account finds it. Pure: reading, writing and merging variables.
 *
 * - `CVC_META`: `{"version":1}`.
 * - `CVC_ORGA_<ID>` / `CVC_USER_<ID>`: one JSON document per space, its
 *   display preferences and favourite views, each with the time of its last
 *   change. Names are upper-cased, `-` turned into `_`.
 *
 * Variables without the `CVC_` prefix, and `CVC_` ones this version does not
 * know, are kept as they are.
 */
import { parseFavorites, type Favorites } from '../home/favorites.js';
import { parsePrefs, type HomePrefs } from '../home/prefs.js';

export const SYNC_VERSION = 1;
export const META_KEY = 'CVC_META';
const PREFIX = 'CVC_';

export interface Variable {
  name: string;
  value: string;
}

/** What is synced of a space. */
export interface SpaceDocument {
  ownerId: string;
  prefs: HomePrefs;
  favorites: Favorites;
}

/** `orga_dda58ca6-…` → `CVC_ORGA_DDA58CA6_…`. */
export function spaceKey(ownerId: string): string {
  return PREFIX + ownerId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

export function encodeSpace(space: SpaceDocument): string {
  return JSON.stringify({ ownerId: space.ownerId, prefs: space.prefs, favorites: space.favorites });
}

/** A space from its variable, null when the value does not hold together. */
export function decodeSpace(value: string): SpaceDocument | null {
  try {
    const parsed = JSON.parse(value) as Partial<Record<keyof SpaceDocument, unknown>> | null;
    if (parsed == null || typeof parsed.ownerId !== 'string') {
      return null;
    }
    return { ownerId: parsed.ownerId, prefs: parsePrefs(parsed.prefs), favorites: parseFavorites(parsed.favorites) };
  } catch {
    return null;
  }
}

/** The spaces the variables hold, by owner; foreign and unreadable variables are left out. */
export function readSpaces(variables: readonly Variable[]): Map<string, SpaceDocument> {
  const spaces = new Map<string, SpaceDocument>();
  for (const variable of variables) {
    if (!variable.name.startsWith(PREFIX) || variable.name === META_KEY) {
      continue;
    }
    const space = decodeSpace(variable.value);
    if (space != null && spaceKey(space.ownerId) === variable.name) {
      spaces.set(space.ownerId, space);
    }
  }
  return spaces;
}

/** The variables with these spaces written in, everything else kept, `CVC_META` set. */
export function writeSpaces(variables: readonly Variable[], spaces: Iterable<SpaceDocument>): Variable[] {
  const next = new Map(variables.map((variable) => [variable.name, variable.value]));
  next.set(META_KEY, JSON.stringify({ version: SYNC_VERSION }));
  for (const space of spaces) {
    next.set(spaceKey(space.ownerId), encodeSpace(space));
  }
  return [...next.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface SpaceMerge {
  merged: SpaceDocument;
  /** The local copy has to take something from the remote one. */
  localChanged: boolean;
  /** The remote copy has to take something from the local one. */
  remoteChanged: boolean;
}

/**
 * The newest wins, part by part: the preferences on their own time, the
 * favourites on theirs (as a whole list, so a removal is not undone by an
 * older copy that still has the view).
 */
export function mergeSpace(local: SpaceDocument, remote: SpaceDocument | undefined): SpaceMerge {
  if (remote == null) {
    const empty = local.prefs.updatedAt === 0 && local.favorites.updatedAt === 0;
    return { merged: local, localChanged: false, remoteChanged: !empty };
  }
  const remotePrefs = remote.prefs.updatedAt > local.prefs.updatedAt;
  const remoteFavorites = remote.favorites.updatedAt > local.favorites.updatedAt;
  return {
    merged: {
      ownerId: local.ownerId,
      prefs: remotePrefs ? remote.prefs : local.prefs,
      favorites: remoteFavorites ? remote.favorites : local.favorites,
    },
    localChanged: remotePrefs || remoteFavorites,
    remoteChanged:
      local.prefs.updatedAt > remote.prefs.updatedAt || local.favorites.updatedAt > remote.favorites.updatedAt,
  };
}
