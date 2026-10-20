import { describe, expect, it } from 'vitest';
import { addFavorite, NO_FAVORITES } from '../home/favorites.js';
import { DEFAULT_PREFS } from '../home/prefs.js';
import { META_KEY, mergeSpace, readSpaces, spaceKey, writeSpaces, type SpaceDocument } from './sync-document.js';

const ORGA = 'orga_dda58ca6-7e88-4f2a-8fce-04e3abb5b867';
const space = (prefsAt: number, favoritesAt: number, grouping = 'project'): SpaceDocument => ({
  ownerId: ORGA,
  prefs: { ...DEFAULT_PREFS, grouping, updatedAt: prefsAt },
  favorites:
    favoritesAt === 0
      ? NO_FAVORITES
      : addFavorite(
          NO_FAVORITES,
          'prod',
          { filter: 'env:prod', grouping: '', sort: DEFAULT_PREFS.sort },
          favoritesAt,
          'a',
        ),
});

describe('sync variables', () => {
  it('names a space after its owner', () => {
    expect(spaceKey(ORGA)).toBe('CVC_ORGA_DDA58CA6_7E88_4F2A_8FCE_04E3ABB5B867');
    expect(spaceKey('user_69ddccd1-aaaa')).toBe('CVC_USER_69DDCCD1_AAAA');
  });

  it('writes spaces among other variables and reads them back', () => {
    const foreign = [
      { name: 'DATABASE_URL', value: 'kept' },
      { name: 'CVC_FUTURE_THING', value: 'kept too' },
    ];
    const written = writeSpaces(foreign, [space(5, 6)]);
    expect(written.map((variable) => variable.name)).toEqual([
      'CVC_FUTURE_THING',
      META_KEY,
      spaceKey(ORGA),
      'DATABASE_URL',
    ]);
    expect(written.find((variable) => variable.name === META_KEY)?.value).toBe('{"version":1}');
    const read = readSpaces(written).get(ORGA);
    expect(read?.prefs.grouping).toBe('project');
    expect(read?.favorites.views.map((view) => view.name)).toEqual(['prod']);
  });

  it('ignores a variable whose content does not match its name', () => {
    expect(readSpaces([{ name: spaceKey(ORGA), value: 'not json' }]).size).toBe(0);
    expect(readSpaces([{ name: 'CVC_ORGA_X', value: JSON.stringify({ ownerId: ORGA }) }]).size).toBe(0);
  });
});

describe('mergeSpace', () => {
  it('takes the newest of each part', () => {
    const { merged, localChanged, remoteChanged } = mergeSpace(space(10, 1, 'local'), space(5, 8, 'remote'));
    expect(merged.prefs.grouping).toBe('local');
    expect(merged.favorites.updatedAt).toBe(8);
    expect(localChanged).toBe(true);
    expect(remoteChanged).toBe(true);
  });

  it('changes nothing when both copies agree', () => {
    const local = space(5, 6);
    expect(mergeSpace(local, space(5, 6))).toMatchObject({ localChanged: false, remoteChanged: false });
  });

  it('pushes a local space the remote does not have, unless it was never touched', () => {
    expect(mergeSpace(space(5, 0), undefined)).toMatchObject({ localChanged: false, remoteChanged: true });
    expect(mergeSpace(space(0, 0), undefined)).toMatchObject({ localChanged: false, remoteChanged: false });
  });
});
