/**
 * Named favourite views of the home list, per organisation: a filter, a
 * grouping and a sort under a name, applied in one click and shared as a
 * link (`?q=&g=&s=`). Kept in localStorage (`cvc.favorites.<ownerId>`) with
 * the time of each change, which the export and the sync of #1 merge on.
 */
import { readSort } from './prefs.js';
import type { SortSpec } from './sorting.js';

/** What a view is made of: the URL of the home page carries all three. */
export interface ViewSpec {
  filter: string;
  grouping: string;
  sort: SortSpec;
}

export interface FavoriteView extends ViewSpec {
  id: string;
  name: string;
  updatedAt: number;
}

export interface Favorites {
  views: FavoriteView[];
  /** The last change of the list, removals included. */
  updatedAt: number;
}

export const NO_FAVORITES: Favorites = { views: [], updatedAt: 0 };

const PREFIX = 'cvc.favorites.';

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Trimmed, as the page compares and stores them. */
export function normaliseView(view: ViewSpec): ViewSpec {
  return { filter: view.filter.trim(), grouping: view.grouping.trim(), sort: view.sort };
}

export function sameView(a: ViewSpec, b: ViewSpec): boolean {
  const left = normaliseView(a);
  const right = normaliseView(b);
  return (
    left.filter === right.filter &&
    left.grouping === right.grouping &&
    left.sort.column === right.sort.column &&
    left.sort.direction === right.sort.direction
  );
}

/** The favourite that is the current view, if any. */
export function findFavorite(favorites: Favorites, view: ViewSpec): FavoriteView | undefined {
  return favorites.views.find((candidate) => sameView(candidate, view));
}

export function addFavorite(
  favorites: Favorites,
  name: string,
  view: ViewSpec,
  now = Date.now(),
  id = newId(),
): Favorites {
  const favorite: FavoriteView = { id, name: name.trim(), ...normaliseView(view), updatedAt: now };
  return { views: [...favorites.views, favorite], updatedAt: now };
}

export function renameFavorite(favorites: Favorites, id: string, name: string, now = Date.now()): Favorites {
  return {
    views: favorites.views.map((view) => (view.id === id ? { ...view, name: name.trim(), updatedAt: now } : view)),
    updatedAt: now,
  };
}

export function removeFavorite(favorites: Favorites, id: string, now = Date.now()): Favorites {
  return { views: favorites.views.filter((view) => view.id !== id), updatedAt: now };
}

/** Puts back a removed favourite where it was, for "Undo". */
export function restoreFavorite(favorites: Favorites, view: FavoriteView, index: number, now = Date.now()): Favorites {
  const views = favorites.views.filter((candidate) => candidate.id !== view.id);
  views.splice(Math.min(index, views.length), 0, view);
  return { views, updatedAt: now };
}

/** "cost.desc": the sort as the `s` parameter of a link. */
export function sortParam(sort: SortSpec): string {
  return `${sort.column}.${sort.direction}`;
}

/** The sort of an `s` parameter, null when it is absent or not one. */
export function readSortParam(value: string | null): SortSpec | null {
  if (value == null) {
    return null;
  }
  const [column, direction] = value.split('.');
  const sort = readSort({ column, direction });
  return sort.column === column ? sort : null;
}

/** The parameters of the home page that open a view. */
export function viewParams(view: ViewSpec): Record<string, string | null> {
  const { filter, grouping, sort } = normaliseView(view);
  return { q: filter || null, g: grouping || null, s: sortParam(sort) };
}

function isView(value: unknown): value is FavoriteView {
  const view = value as Partial<FavoriteView> | null;
  return (
    typeof view?.id === 'string' &&
    typeof view.name === 'string' &&
    typeof view.filter === 'string' &&
    typeof view.grouping === 'string' &&
    typeof view.updatedAt === 'number'
  );
}

export function readFavorites(ownerId: string): Favorites {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFIX + ownerId) ?? 'null') as Partial<Favorites> | null;
    if (parsed == null || !Array.isArray(parsed.views)) {
      return NO_FAVORITES;
    }
    return {
      views: parsed.views.filter(isView).map((view) => ({ ...view, sort: readSort(view.sort) })),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return NO_FAVORITES;
  }
}

export function writeFavorites(ownerId: string, favorites: Favorites): void {
  try {
    localStorage.setItem(PREFIX + ownerId, JSON.stringify(favorites));
  } catch {
    // Not essential: the favourite lives until the tab closes.
  }
}
