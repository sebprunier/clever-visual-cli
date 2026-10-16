/**
 * Search syntax of the home page, in the spirit of a CLI filter:
 *
 *   api prod                 free text, every word must match the name, runtime or a tag
 *   tag:env:prod             a tag, exact or by prefix (`tag:env` matches `env:prod`)
 *   project:marketing        the `project:<name>[:<env>]` tag convention
 *   env:prod                 `env:prod`, or `project:*:prod`
 *   runtime:node             runtime variant (applications) or provider (add-ons)
 *   state:arrêtée            state label as displayed
 *   is:app | is:addon        one kind only
 *
 * Matching ignores case and accents.
 */
import { normalise } from '../palette.js';

export type ItemKind = 'app' | 'addon';

export interface ParsedQuery {
  terms: string[];
  tags: string[];
  projects: string[];
  envs: string[];
  runtimes: string[];
  states: string[];
  kinds: ItemKind[];
}

export interface Matchable {
  kind: ItemKind;
  name: string;
  runtime: string;
  state?: string;
  tags: string[];
  /** Extra searchable words: ids, commit, zone... */
  extra?: string[];
}

const EMPTY: ParsedQuery = { terms: [], tags: [], projects: [], envs: [], runtimes: [], states: [], kinds: [] };

export function parseQuery(raw: string): ParsedQuery {
  const query: ParsedQuery = { terms: [], tags: [], projects: [], envs: [], runtimes: [], states: [], kinds: [] };
  for (const token of raw.split(/\s+/)) {
    const normalised = normalise(token);
    if (normalised === '') {
      continue;
    }
    const colon = normalised.indexOf(':');
    const prefix = colon === -1 ? '' : normalised.slice(0, colon);
    const value = colon === -1 ? '' : normalised.slice(colon + 1);
    if (value === '') {
      query.terms.push(normalised);
      continue;
    }
    switch (prefix) {
      case 'tag':
        query.tags.push(value);
        break;
      case 'project':
        query.projects.push(value);
        break;
      case 'env':
        query.envs.push(value);
        break;
      case 'runtime':
        query.runtimes.push(value);
        break;
      case 'state':
        query.states.push(value);
        break;
      case 'is':
        if (value === 'app' || value === 'addon') {
          query.kinds.push(value);
        }
        break;
      default:
        query.terms.push(normalised);
    }
  }
  return query;
}

export function isEmptyQuery(query: ParsedQuery): boolean {
  return (Object.keys(EMPTY) as Array<keyof ParsedQuery>).every((key) => query[key].length === 0);
}

export function matchesQuery(query: ParsedQuery, item: Matchable): boolean {
  if (query.kinds.length > 0 && !query.kinds.includes(item.kind)) {
    return false;
  }
  const tags = item.tags.map(normalise);
  for (const wanted of query.tags) {
    if (!tags.some((tag) => tag === wanted || tag.startsWith(wanted))) {
      return false;
    }
  }
  for (const project of query.projects) {
    if (!tags.some((tag) => tag === `project:${project}` || tag.startsWith(`project:${project}:`))) {
      return false;
    }
  }
  for (const env of query.envs) {
    if (!tags.some((tag) => tag === `env:${env}` || (tag.startsWith('project:') && tag.endsWith(`:${env}`)))) {
      return false;
    }
  }
  const runtime = normalise(item.runtime);
  for (const wanted of query.runtimes) {
    if (!runtime.includes(wanted)) {
      return false;
    }
  }
  const state = item.state == null ? '' : normalise(item.state);
  for (const wanted of query.states) {
    if (!state.includes(wanted)) {
      return false;
    }
  }
  if (query.terms.length > 0) {
    const haystack = [normalise(item.name), runtime, ...tags, ...(item.extra ?? []).map(normalise)].join(' ');
    for (const term of query.terms) {
      if (!haystack.includes(term)) {
        return false;
      }
    }
  }
  return true;
}

/** Adds `token` to the raw query, or removes it when already present. */
export function toggleToken(raw: string, token: string): string {
  const tokens = raw.split(/\s+/).filter((candidate) => candidate !== '');
  const index = tokens.findIndex((candidate) => normalise(candidate) === normalise(token));
  if (index === -1) {
    tokens.push(token);
  } else {
    tokens.splice(index, 1);
  }
  return tokens.join(' ');
}
