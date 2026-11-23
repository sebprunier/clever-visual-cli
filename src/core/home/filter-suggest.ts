/**
 * Suggestions while typing a filter expression (#45): the keys, then the values
 * that make sense after a key, taken from the resources of the organisation.
 * Each value comes with the number of resources it keeps on its own, and a
 * value that keeps nothing is left out. Nothing is fetched: every word is in
 * the items the list already prepares for the filter.
 */
import { normalise } from '../palette.js';
import {
  ARCHIVED,
  DEPLOYING,
  FAILED,
  RESERVED_KEYS,
  matchesPrepared,
  parseFilter,
  prepareFilterItem,
  wantsArchived,
  wordSpans,
  type FilterItem,
  type PreparedFilterItem,
} from './filter.js';
import { stateNames } from './state-words.js';

export interface Suggestion {
  /** What replaces the word under the caret: `is:`, `is:failed`, `-env:prod`, `project:"my project"`, `AND`. */
  text: string;
  /** A key waits for its value: no space after it, and the list stays open. */
  key: boolean;
  /** The resources the term keeps on its own; null for a key or an operator. */
  count: number | null;
}

export interface Suggestions {
  /** The part of the raw expression a suggestion replaces: the word under the caret. */
  from: number;
  to: number;
  items: Suggestion[];
}

export const MAX_SUGGESTIONS = 8;

/** The keys with a meaning of their own, in the order they are offered. */
const KEYS = ['is', 'has', 'tag', 'runtime', 'state', 'name'];
/** The words of `is:` beyond the slugs. */
const IS_WORDS = ['app', 'addon', 'watch', FAILED, DEPLOYING, 'shared', ARCHIVED];
const OPERATORS = ['AND', 'OR', 'NOT'];

interface Candidate {
  /** The text of the term, without a leading dash. */
  text: string;
  /** What the typed text is compared with: the key, or the value. */
  match: string;
  key: boolean;
  /** Counted: a value. A key or an operator is not. */
  counted: boolean;
}

/**
 * The suggestions for the word under `caret` in `raw`, or null when there are none: the caret is
 * not on a word, the word is free text no key holds, or no value of its key keeps anything.
 */
export function suggest(raw: string, caret: number, items: readonly FilterItem[]): Suggestions | null {
  const words = wordSpans(raw);
  const index = words.findIndex((word) => word.start < caret && caret <= word.end);
  if (index === -1) {
    return null;
  }
  const span = words[index];
  const typed = raw.slice(span.start, caret);
  const dash = typed.startsWith('-') ? '-' : '';
  const body = typed.slice(dash.length);
  if (body === '' || body.startsWith('"')) {
    return null;
  }
  const colon = body.indexOf(':');
  let candidates: Candidate[];
  let prefix: string;
  if (colon === -1) {
    prefix = body;
    candidates = keyCandidates(items);
    if (dash === '' && index > 0) {
      const operators = OPERATORS.filter((operator) => operator.startsWith(body.toUpperCase()));
      candidates.push(
        ...operators.map((operator) => ({ text: operator, match: operator, key: false, counted: false })),
      );
    }
  } else {
    prefix = body.slice(colon + 1).replace(/^"|"$/g, '');
    candidates = valueCandidates(normalise(body.slice(0, colon)), items);
  }
  const ranked = rank(candidates, normalise(prefix));
  if (ranked.length === 0) {
    return null;
  }
  const prepared = items.map(prepareFilterItem);
  const result: Suggestion[] = [];
  for (const candidate of ranked) {
    const text = `${dash}${candidate.text}`;
    if (candidate.counted) {
      // Left out when the term itself keeps nothing; shown with what it keeps, the dash included.
      const count = countOf(candidate.text, prepared);
      if (count === 0) {
        continue;
      }
      result.push({ text, key: false, count: dash === '' ? count : countOf(text, prepared) });
    } else {
      result.push({ text, key: candidate.key, count: null });
    }
    if (result.length === MAX_SUGGESTIONS) {
      break;
    }
  }
  return result.length === 0 ? null : { from: span.start, to: span.end, items: result };
}

/** The expression with the suggestion in place of the word, and where the caret goes. */
export function acceptSuggestion(
  raw: string,
  suggestions: Pick<Suggestions, 'from' | 'to'>,
  suggestion: Suggestion,
): { text: string; caret: number } {
  const before = raw.slice(0, suggestions.from) + suggestion.text;
  const after = raw.slice(suggestions.to);
  if (suggestion.key || after.startsWith(')')) {
    return { text: before + after, caret: before.length };
  }
  // A full term is followed by a space, so the next word can start: an existing one is stepped over.
  if (/^\s/.test(after)) {
    return { text: before + after, caret: before.length + 1 };
  }
  return { text: `${before} ${after}`, caret: before.length + 1 };
}

// --- candidates ------------------------------------------------------------

function keyCandidates(items: readonly FilterItem[]): Candidate[] {
  const tagKeys = byFrequency(
    items.map((item) => item.tags.filter((tag) => tag.includes(':')).map((tag) => tag.slice(0, tag.indexOf(':')))),
  ).filter((key) => key !== '' && !RESERVED_KEYS.has(normalise(key)));
  return [...KEYS, ...tagKeys].map((key) => ({ text: `${key}:`, match: key, key: true, counted: false }));
}

function valueCandidates(key: string, items: readonly FilterItem[]): Candidate[] {
  const values = (() => {
    switch (key) {
      case 'is':
        return [...IS_WORDS, ...slugs(items)];
      case 'state':
        return stateNames();
      case 'has':
        return byFrequency(
          items.map((item) =>
            item.tags.filter((tag) => tag.includes(':')).map((tag) => tag.slice(0, tag.indexOf(':'))),
          ),
        );
      case 'tag':
        return byFrequency(items.map((item) => item.tags));
      case 'runtime':
        return byFrequency(items.map((item) => [item.runtime]));
      case 'name':
        return [...new Set(items.map((item) => item.name))].sort((a, b) => a.localeCompare(b));
      default:
        return tagValues(key, items);
    }
  })();
  return values
    .filter((value) => value !== '' && !value.includes('"'))
    .map((value) => ({ text: `${key}:${quote(value)}`, match: value, key: false, counted: true }));
}

/** The slugs of the runtimes and providers present, the `-addon` form left out when the short one is there. */
function slugs(items: readonly FilterItem[]): string[] {
  const all = byFrequency(items.map((item) => item.slugs));
  const present = new Set(all);
  return all.filter((slug) => !(slug.endsWith('-addon') && present.has(slug.slice(0, -'-addon'.length))));
}

/** The values of a tag key: `project:shop:prod` gives `shop` and `shop:prod`. */
function tagValues(key: string, items: readonly FilterItem[]): string[] {
  return byFrequency(
    items.map((item) =>
      item.tags
        .filter((tag) => normalise(tag).startsWith(`${key}:`))
        .flatMap((tag) => {
          const segments = tag.slice(key.length + 1).split(':');
          return segments.map((_, end) => segments.slice(0, end + 1).join(':'));
        }),
    ),
  );
}

/** Distinct words, the ones most resources carry first, then alphabetically. */
function byFrequency(perItem: ReadonlyArray<readonly string[]>): string[] {
  const counts = new Map<string, number>();
  for (const words of perItem) {
    for (const word of new Set(words)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word]) => word);
}

function quote(value: string): string {
  return /[\s()]/.test(value) ? `"${value}"` : value;
}

/** Words that start with the typed text first, then words that contain it, each in their own order. */
function rank(candidates: readonly Candidate[], typed: string): Candidate[] {
  const starts: Candidate[] = [];
  const contains: Candidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const match = normalise(candidate.match);
    if (seen.has(candidate.text)) {
      continue;
    }
    if (match.startsWith(typed)) {
      starts.push(candidate);
      seen.add(candidate.text);
    } else if (match.includes(typed)) {
      contains.push(candidate);
      seen.add(candidate.text);
    }
  }
  return [...starts, ...contains];
}

/** What the list shows for this expression alone: the archived applications only when it asks for them. */
function countOf(expression: string, items: readonly PreparedFilterItem[]): number {
  const filter = parseFilter(expression);
  const archived = wantsArchived(filter);
  return items.filter((item) => (archived || !item.flags.includes(ARCHIVED)) && matchesPrepared(filter, item)).length;
}
