import { describe, expect, it } from 'vitest';
import { isEmptyQuery, matchesQuery, parseQuery, toggleToken, type Matchable } from './query.js';

const api: Matchable = {
  kind: 'app',
  name: 'API Météo prod',
  runtime: 'Node.js',
  state: 'démarrée',
  tags: ['env:prod', 'project:meteo:prod'],
  extra: ['app_1234'],
};
const db: Matchable = { kind: 'addon', name: 'meteo-db', runtime: 'postgresql-addon', tags: ['project:meteo:prod'] };

describe('home query', () => {
  it('parses prefixes and free text, ignoring case and accents', () => {
    expect(
      parseQuery('  Météo tag:Env:PROD project:meteo env:prod runtime:node state:démarrée is:app is:nope x: '),
    ).toEqual({
      terms: ['meteo', 'x:'],
      tags: ['env:prod'],
      projects: ['meteo'],
      envs: ['prod'],
      runtimes: ['node'],
      states: ['demarree'],
      kinds: ['app'],
    });
    expect(isEmptyQuery(parseQuery('   '))).toBe(true);
    expect(isEmptyQuery(parseQuery('a'))).toBe(false);
  });

  it('matches free text against name, runtime, tags and extras', () => {
    expect(matchesQuery(parseQuery('meteo prod'), api)).toBe(true);
    expect(matchesQuery(parseQuery('node'), api)).toBe(true);
    expect(matchesQuery(parseQuery('app_12'), api)).toBe(true);
    expect(matchesQuery(parseQuery('meteo dev'), api)).toBe(false);
    expect(matchesQuery(parseQuery('postgres'), db)).toBe(true);
  });

  it('matches tags exactly or by prefix, and the project/env conventions', () => {
    expect(matchesQuery(parseQuery('tag:env:prod'), api)).toBe(true);
    expect(matchesQuery(parseQuery('tag:env'), api)).toBe(true);
    expect(matchesQuery(parseQuery('tag:env'), db)).toBe(false);
    expect(matchesQuery(parseQuery('project:meteo'), db)).toBe(true);
    expect(matchesQuery(parseQuery('project:met'), db)).toBe(false);
    expect(matchesQuery(parseQuery('env:prod'), db)).toBe(true);
    expect(matchesQuery(parseQuery('env:dev'), api)).toBe(false);
  });

  it('matches kind, runtime and state', () => {
    expect(matchesQuery(parseQuery('is:addon'), api)).toBe(false);
    expect(matchesQuery(parseQuery('is:addon'), db)).toBe(true);
    expect(matchesQuery(parseQuery('runtime:postgres'), db)).toBe(true);
    expect(matchesQuery(parseQuery('state:demarree'), api)).toBe(true);
    expect(matchesQuery(parseQuery('state:arretee'), api)).toBe(false);
    expect(matchesQuery(parseQuery('state:arretee'), db)).toBe(false);
  });

  it('toggles tokens in the raw query', () => {
    expect(toggleToken('', 'tag:env:prod')).toBe('tag:env:prod');
    expect(toggleToken('api  tag:env:prod', 'tag:env:prod')).toBe('api');
    expect(toggleToken('api', 'tag:env:prod')).toBe('api tag:env:prod');
  });
});
