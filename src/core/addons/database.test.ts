import { describe, expect, it } from 'vitest';
import type { AddonSummary } from '../../data/api.js';
import { addonWatchList, compareVersions, isRetiredVersion } from './database.js';

const OFFERED = ['13', '14', '15', '16', '17', '18'];

describe('versions', () => {
  it('orders numerically', () => {
    expect(['18', '9', '13', '13.2'].sort(compareVersions)).toEqual(['9', '13', '13.2', '18']);
  });

  it('calls retired a version older than every offered one', () => {
    expect(isRetiredVersion('11', OFFERED)).toBe(true);
    expect(isRetiredVersion('12.4', OFFERED)).toBe(true);
    expect(isRetiredVersion('13', OFFERED)).toBe(false);
    expect(isRetiredVersion('15.4', OFFERED)).toBe(false);
  });

  it('does not call retired a version the list does not know yet, nor anything without a list', () => {
    expect(isRetiredVersion('19', OFFERED)).toBe(false);
    expect(isRetiredVersion('11', [])).toBe(false);
    expect(isRetiredVersion('', OFFERED)).toBe(false);
  });
});

describe('addonWatchList', () => {
  const addon = (id: string, name: string, providerId = 'postgresql-addon') =>
    ({ id, name, providerId }) as AddonSummary;
  const versions: Record<string, string> = { a: '15', b: '11', c: '11', d: '9.6', e: '11' };

  it('lists the databases on a retired version, oldest first', () => {
    const items = addonWatchList(
      [
        addon('a', 'shop'),
        addon('b', 'zeta'),
        addon('c', 'alpha'),
        addon('d', 'legacy'),
        addon('e', 'cache', 'redis-addon'),
      ],
      (candidate) => versions[candidate.id] ?? null,
      (providerId) => (providerId === 'postgresql-addon' ? OFFERED : null),
    );
    expect(items.map((item) => [item.addon.name, item.version])).toEqual([
      ['legacy', '9.6'],
      ['alpha', '11'],
      ['zeta', '11'],
    ]);
    expect(items[0].offered[0]).toBe('13');
  });

  it('waits for both the version and the offered list', () => {
    expect(
      addonWatchList(
        [addon('b', 'zeta')],
        () => null,
        () => OFFERED,
      ),
    ).toEqual([]);
    expect(
      addonWatchList(
        [addon('b', 'zeta')],
        () => '11',
        () => null,
      ),
    ).toEqual([]);
  });
});
