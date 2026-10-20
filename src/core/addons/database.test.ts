import { describe, expect, it } from 'vitest';
import type { AddonSummary } from '../../data/api.js';
import { addonWatchList, backupUse, compareVersions, isRetiredVersion } from './database.js';

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

  it('compares at the precision of the offered list', () => {
    expect(isRetiredVersion('7.0.11', ['8.10.2'])).toBe(true);
    expect(isRetiredVersion('7.2.4', ['8.10.2'])).toBe(true);
    expect(isRetiredVersion('8.10.2', ['8.10.2'])).toBe(false);
    expect(isRetiredVersion('4.0.3', ['4.0.3'])).toBe(false);
    const mysql = ['5.7', '8.0', '8.4', '9.7'];
    expect(isRetiredVersion('5.7', mysql)).toBe(false);
    expect(isRetiredVersion('8.0.46', mysql)).toBe(false);
    expect(isRetiredVersion('5.6', mysql)).toBe(true);
  });

  it('does not call retired a version the list does not know yet, nor anything without a list', () => {
    expect(isRetiredVersion('19', OFFERED)).toBe(false);
    expect(isRetiredVersion('11', [])).toBe(false);
    expect(isRetiredVersion('', OFFERED)).toBe(false);
  });
});

describe('backupUse', () => {
  const target = { host: 'abc-postgresql.services.clever-cloud.com', port: 6578, user: 'u1', database: 'abc' };

  it('builds pg_restore with the real connection and file', () => {
    expect(backupUse('postgresql-addon', target, 'postgresql_x-20261018035211.dump')).toEqual({
      kind: 'restore',
      command:
        'pg_restore -h abc-postgresql.services.clever-cloud.com -p 6578 -U u1 -d abc' +
        ' --no-owner --no-privileges --no-comments --format=c postgresql_x-20261018035211.dump',
      password: 'POSTGRESQL_ADDON_PASSWORD',
    });
  });

  it('pipes the MySQL dump into mysql, which asks for the password', () => {
    const mysql = { host: 'abc-mysql.services.clever-cloud.com', port: 20466, user: 'u2', database: 'abc' };
    expect(backupUse('mysql-addon', mysql, 'mysql_x-20261017035907.sql.gz')).toEqual({
      kind: 'restore',
      command:
        'gunzip -c mysql_x-20261017035907.sql.gz | mysql -h abc-mysql.services.clever-cloud.com -P 20466 -u u2 -p -D abc',
      password: 'MYSQL_ADDON_PASSWORD',
    });
  });

  it('waits for the details before writing a restore command', () => {
    expect(backupUse('postgresql-addon', null, 'x.dump').command).toBeNull();
  });

  it('only gets the data out of Redis and MongoDB backups', () => {
    expect(backupUse('redis-addon', null, 'redis_x-20261015031542')).toEqual({
      kind: 'retrieve',
      command: 'tar -xzf redis_x-20261015031542',
      password: null,
    });
    expect(backupUse('mongodb-addon', target, 'x')).toEqual({ kind: 'retrieve', command: null, password: null });
  });
});

describe('addonWatchList', () => {
  const addon = (id: string, name: string, providerId = 'postgresql-addon') =>
    ({ id, name, providerId }) as AddonSummary;
  const versions: Record<string, string> = { a: '15', b: '11', c: '11', d: '9.6', e: '11', f: '7.0.11' };

  it('lists the databases on a retired version by product, oldest first', () => {
    const items = addonWatchList(
      [
        addon('a', 'shop'),
        addon('b', 'zeta'),
        addon('c', 'alpha'),
        addon('d', 'legacy'),
        addon('e', 'cache', 'cellar-addon'),
        addon('f', 'sessions', 'redis-addon'),
      ],
      (candidate) => versions[candidate.id] ?? null,
      (providerId) => (providerId === 'postgresql-addon' ? OFFERED : providerId === 'redis-addon' ? ['8.10.2'] : null),
    );
    expect(items.map((item) => [item.addon.name, item.version])).toEqual([
      ['legacy', '9.6'],
      ['alpha', '11'],
      ['zeta', '11'],
      ['sessions', '7.0.11'],
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
