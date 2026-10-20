import { describe, expect, it } from 'vitest';
import {
  addFavorite,
  findFavorite,
  NO_FAVORITES,
  readSortParam,
  removeFavorite,
  renameFavorite,
  restoreFavorite,
  sameView,
  viewParams,
} from './favorites.js';

const PROD = {
  filter: ' project:shop env:prod ',
  grouping: 'project > env',
  sort: { column: 'name', direction: 'asc' },
} as const;

describe('favorites', () => {
  it('saves a view under a name, trimmed, and finds it again', () => {
    const favorites = addFavorite(NO_FAVORITES, ' prod of shop ', PROD, 10, 'a');
    expect(favorites.views).toEqual([
      {
        id: 'a',
        name: 'prod of shop',
        filter: 'project:shop env:prod',
        grouping: 'project > env',
        sort: { column: 'name', direction: 'asc' },
        updatedAt: 10,
      },
    ]);
    expect(favorites.updatedAt).toBe(10);
    expect(findFavorite(favorites, { ...PROD, filter: 'project:shop env:prod' })?.id).toBe('a');
    expect(findFavorite(favorites, { ...PROD, sort: { column: 'cost', direction: 'desc' } })).toBeUndefined();
  });

  it('renames, removes and puts back where it was', () => {
    let favorites = addFavorite(NO_FAVORITES, 'one', PROD, 1, 'a');
    favorites = addFavorite(favorites, 'two', { ...PROD, filter: 'is:app' }, 2, 'b');
    favorites = renameFavorite(favorites, 'a', 'first', 3);
    expect(favorites.views.map((view) => view.name)).toEqual(['first', 'two']);
    const removed = favorites.views[0];
    favorites = removeFavorite(favorites, 'a', 4);
    expect(favorites.views.map((view) => view.id)).toEqual(['b']);
    expect(favorites.updatedAt).toBe(4);
    expect(restoreFavorite(favorites, removed, 0, 5).views.map((view) => view.id)).toEqual(['a', 'b']);
  });

  it('compares views on what the page shows', () => {
    expect(sameView(PROD, { ...PROD, grouping: ' project > env ' })).toBe(true);
    expect(sameView(PROD, { ...PROD, grouping: 'project' })).toBe(false);
  });

  it('opens a view through the q, g and s parameters', () => {
    expect(viewParams(PROD)).toEqual({ q: 'project:shop env:prod', g: 'project > env', s: 'name.asc' });
    expect(viewParams({ filter: '', grouping: '', sort: { column: 'cost', direction: 'desc' } })).toEqual({
      q: null,
      g: null,
      s: 'cost.desc',
    });
    expect(readSortParam('cost.desc')).toEqual({ column: 'cost', direction: 'desc' });
    expect(readSortParam('nope.asc')).toBeNull();
    expect(readSortParam(null)).toBeNull();
  });
});
