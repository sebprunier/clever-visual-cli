import { beforeAll, describe, expect, it } from 'vitest';
import { isEmptyFilter, matchesFilter, parseFilter, toggleToken, type FilterItem } from './filter.js';
import { setLocale } from '../i18n.js';

beforeAll(() => setLocale('fr', false));

const api: FilterItem = {
  kind: 'app',
  name: 'API Météo prod',
  slugs: ['node', 'node'],
  runtime: 'Node.js',
  state: 'démarrée',
  tags: ['env:prod', 'project:meteo:prod'],
  extra: ['app_1234'],
};
const db: FilterItem = {
  kind: 'addon',
  name: 'meteo-db',
  slugs: ['postgresql-addon', 'postgresql'],
  runtime: 'postgresql-addon',
  tags: ['project:meteo:prod'],
};
const untagged: FilterItem = {
  kind: 'addon',
  name: 'old-bucket',
  slugs: ['cellar-addon', 'cellar'],
  runtime: 'cellar-addon',
  tags: [],
};

const keep = (expression: string) =>
  [api, db, untagged].filter((item) => matchesFilter(parseFilter(expression), item)).map((item) => item.name);

describe('home filter', () => {
  it('matches everything on an empty expression', () => {
    expect(isEmptyFilter(parseFilter('   '))).toBe(true);
    expect(keep('')).toEqual(['API Météo prod', 'meteo-db', 'old-bucket']);
  });

  it('matches free text against name, runtime, tags and extras, ignoring case and accents', () => {
    expect(keep('meteo')).toEqual(['API Météo prod', 'meteo-db']);
    expect(keep('MÉTÉO prod')).toEqual(['API Météo prod', 'meteo-db']);
    expect(keep('app_12')).toEqual(['API Météo prod']);
    expect(keep('"meteo prod"')).toEqual(['API Météo prod']);
    expect(keep('"api prod"')).toEqual([]);
    expect(keep('"API Météo"')).toEqual(['API Météo prod']);
  });

  it('understands is:, has:, tag:, runtime:, state:, name: and tag keys', () => {
    expect(keep('is:app')).toEqual(['API Météo prod']);
    expect(keep('is:addon')).toEqual(['meteo-db', 'old-bucket']);
    expect(keep('is:node')).toEqual(['API Météo prod']);
    expect(keep('is:postgresql')).toEqual(['meteo-db']);
    expect(keep('has:project')).toEqual(['API Météo prod', 'meteo-db']);
    expect(keep('has:env')).toEqual(['API Météo prod']);
    expect(keep('tag:env')).toEqual(['API Météo prod']);
    expect(keep('runtime:postgres')).toEqual(['meteo-db']);
    expect(keep('state:demarree')).toEqual(['API Météo prod']);
    expect(keep('name:bucket')).toEqual(['old-bucket']);
    expect(keep('project:meteo')).toEqual(['API Météo prod', 'meteo-db']);
    expect(keep('project:met')).toEqual([]);
    expect(keep('project:meteo:prod')).toEqual(['API Météo prod', 'meteo-db']);
    expect(keep('env:prod')).toEqual(['API Météo prod']);
    expect(keep('team:x')).toEqual([]);
  });

  it('combines with AND, OR, NOT, - and parentheses, operators being case-insensitive', () => {
    expect(keep('is:addon AND project:meteo')).toEqual(['meteo-db']);
    expect(keep('is:addon project:meteo')).toEqual(['meteo-db']);
    expect(keep('is:app or name:bucket')).toEqual(['API Météo prod', 'old-bucket']);
    expect(keep('is:addon AND NOT has:project')).toEqual(['old-bucket']);
    expect(keep('is:addon -has:project')).toEqual(['old-bucket']);
    expect(keep('not is:addon')).toEqual(['API Météo prod']);
    expect(keep('is:app OR is:addon AND has:project')).toEqual(['API Météo prod', 'meteo-db']);
    expect(keep('(is:app OR is:addon) AND has:project')).toEqual(['API Météo prod', 'meteo-db']);
    expect(keep('meteo (env:prod OR name:db)')).toEqual(['API Météo prod', 'meteo-db']);
    expect(keep('NOT (is:app OR name:db)')).toEqual(['old-bucket']);
  });

  it('negates a quoted term or a group with a dash stuck to it, as NOT does (#23)', () => {
    expect(keep('-"api météo"')).toEqual(['meteo-db', 'old-bucket']);
    expect(keep('-project:"meteo"')).toEqual(['old-bucket']);
    expect(keep('-(is:app OR name:db)')).toEqual(['old-bucket']);
    expect(keep('is:addon -(has:project)')).toEqual(['old-bucket']);
    expect(parseFilter('-(is:app OR name:db)').error).toBeNull();
    // A dash on its own is still a word to look for.
    expect(keep('- bucket')).toEqual(['old-bucket']);
  });

  it('reports syntax errors and falls back to the implicit AND of the terms', () => {
    const unclosed = parseFilter('(is:addon AND project:meteo');
    expect(unclosed.error).toBe('parenthèse non fermée');
    expect([api, db, untagged].filter((item) => matchesFilter(unclosed, item)).map((item) => item.name)).toEqual([
      'meteo-db',
    ]);
    expect(parseFilter('is:app AND').error).toBe('opérateur sans opérande');
    expect(parseFilter('is:app )').error).toBe('parenthèse fermante en trop');
    expect(parseFilter('()').error).toBe('parenthèses vides');
    expect(parseFilter('AND OR').node).toBeNull();
    expect(parseFilter('-').node).toEqual({ type: 'term', key: null, value: '-' });
  });

  it('toggles tokens in the raw expression', () => {
    expect(toggleToken('', 'env:prod')).toBe('env:prod');
    expect(toggleToken('api  env:prod', 'env:prod')).toBe('api');
    expect(toggleToken('api', 'tag:MaVille')).toBe('api tag:MaVille');
  });
});

describe('is:watch', () => {
  const failing: FilterItem = { ...api, name: 'API en échec', flags: ['watch'] };

  it('matches the applications flagged to watch', () => {
    const filter = parseFilter('is:watch');
    expect(matchesFilter(filter, failing)).toBe(true);
    expect(matchesFilter(filter, api)).toBe(false);
    expect(matchesFilter(filter, db)).toBe(false);
  });

  it('combines with the other terms', () => {
    expect(matchesFilter(parseFilter('is:watch env:prod'), failing)).toBe(true);
    expect(matchesFilter(parseFilter('-is:watch'), api)).toBe(true);
    expect(matchesFilter(parseFilter('runtime:watch'), failing)).toBe(false);
  });
});
