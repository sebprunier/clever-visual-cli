/**
 * Filter expressions of the home page, in the spirit of a CLI:
 *
 *   api prod                       free text, every word must match the name, runtime or a tag
 *   is:app  is:addon               one kind only
 *   is:node  is:postgresql         runtime or add-on provider slug, like the Console's sidebar
 *   is:watch                       applications and add-ons listed under "To watch"
 *   project:shop  env:prod         any `<key>:<value>` matches the tag `key:value` (or `key:value:…`)
 *   has:project                    has a tag with this key
 *   tag:env  runtime:java  state:arrêtée  name:api
 *   NOT env:prod   -env:prod       negation
 *   a AND b   a b                  conjunction (implicit between terms)
 *   a OR b                         disjunction, lowest precedence
 *   ( … )                          grouping
 *   "deux mots"  project:"mon projet"
 *
 * Operators are case-insensitive. Matching ignores case and accents. A malformed
 * expression reports an error and falls back to the implicit AND of its terms.
 */
import { t } from '../i18n.js';
import { normalise } from '../palette.js';

export type ItemKind = 'app' | 'addon';

export type FilterNode =
  | { type: 'and'; children: FilterNode[] }
  | { type: 'or'; children: FilterNode[] }
  | { type: 'not'; child: FilterNode }
  | { type: 'term'; key: string | null; value: string };

export interface ParsedFilter {
  raw: string;
  /** `null` matches everything. */
  node: FilterNode | null;
  error: string | null;
}

/** What a resource exposes to the filter. */
export interface FilterItem {
  kind: ItemKind;
  name: string;
  /** Slugs for `is:`: runtime variant and instance type, or provider id with and without `-addon`. */
  slugs: string[];
  /** Runtime or provider display name. */
  runtime: string;
  /** State label as displayed. */
  state?: string;
  tags: string[];
  /** Extra searchable words: ids, linked resource names... */
  extra?: string[];
  /** Words for `is:` beyond the slugs: `watch` for a resource listed under "To watch", `shared` for a shared add-on. */
  flags?: string[];
}

/** Keys with a meaning of their own; any other key is a tag key. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['is', 'has', 'tag', 'runtime', 'state', 'name']);

interface Token {
  type: 'lparen' | 'rparen' | 'and' | 'or' | 'not' | 'term';
  key?: string | null;
  value?: string;
  negated?: boolean;
}

class FilterSyntaxError extends Error {}

export function parseFilter(raw: string): ParsedFilter {
  const tokens = tokenize(raw);
  if (tokens.length === 0) {
    return { raw, node: null, error: null };
  }
  try {
    const parser = new Parser(tokens);
    const node = parser.parseOr();
    if (parser.peek() != null) {
      throw new FilterSyntaxError(
        parser.peek()?.type === 'rparen' ? t('filter.error.extraParen') : t('filter.error.unexpected'),
      );
    }
    return { raw, node, error: null };
  } catch (error) {
    const message = error instanceof FilterSyntaxError ? error.message : t('filter.error.invalid');
    const terms = tokens
      .filter((token) => token.type === 'term')
      .map((token): FilterNode => {
        const term: FilterNode = { type: 'term', key: token.key ?? null, value: token.value ?? '' };
        return token.negated ? { type: 'not', child: term } : term;
      });
    return {
      raw,
      node: terms.length === 0 ? null : terms.length === 1 ? terms[0] : { type: 'and', children: terms },
      error: message,
    };
  }
}

export function isEmptyFilter(filter: ParsedFilter): boolean {
  return filter.node == null;
}

export function matchesFilter(filter: ParsedFilter, item: FilterItem): boolean {
  if (filter.node == null) {
    return true;
  }
  return evaluate(filter.node, prepare(item));
}

/** Adds `token` to the raw expression, or removes it when already present. */
export function toggleToken(raw: string, token: string): string {
  const parts = raw.split(/\s+/).filter((candidate) => candidate !== '');
  const index = parts.findIndex((candidate) => normalise(candidate) === normalise(token));
  if (index === -1) {
    parts.push(token);
  } else {
    parts.splice(index, 1);
  }
  return parts.join(' ');
}

// --- tokenizer -------------------------------------------------------------

function tokenize(raw: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < raw.length) {
    const char = raw[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: char === '(' ? 'lparen' : 'rparen' });
      index += 1;
      continue;
    }
    let word = '';
    let quoted = false;
    while (index < raw.length && !/[\s()]/.test(raw[index])) {
      if (raw[index] === '"') {
        quoted = true;
        const close = raw.indexOf('"', index + 1);
        word += close === -1 ? raw.slice(index + 1) : raw.slice(index + 1, close);
        index = close === -1 ? raw.length : close + 1;
        if (close === -1) {
          break;
        }
        continue;
      }
      word += raw[index];
      index += 1;
    }
    if (word === '') {
      continue;
    }
    const lower = word.toLowerCase();
    if (!quoted && (lower === 'and' || lower === 'or' || lower === 'not')) {
      tokens.push({ type: lower });
      continue;
    }
    let negated = false;
    if (!quoted && word.startsWith('-') && word.length > 1) {
      negated = true;
      word = word.slice(1);
    }
    const colon = word.indexOf(':');
    if (colon > 0 && colon < word.length - 1) {
      tokens.push({
        type: 'term',
        key: normalise(word.slice(0, colon)),
        value: normalise(word.slice(colon + 1)),
        negated,
      });
    } else {
      tokens.push({ type: 'term', key: null, value: normalise(word), negated });
    }
  }
  return tokens;
}

// --- parser ----------------------------------------------------------------

class Parser {
  #tokens: Token[];
  #index = 0;

  constructor(tokens: Token[]) {
    this.#tokens = tokens;
  }

  peek(): Token | undefined {
    return this.#tokens[this.#index];
  }

  #next(): Token | undefined {
    return this.#tokens[this.#index++];
  }

  parseOr(): FilterNode {
    const children = [this.parseAnd()];
    while (this.peek()?.type === 'or') {
      this.#next();
      children.push(this.parseAnd());
    }
    return children.length === 1 ? children[0] : { type: 'or', children };
  }

  parseAnd(): FilterNode {
    const children = [this.parseNot()];
    for (;;) {
      const token = this.peek();
      if (token == null || token.type === 'or' || token.type === 'rparen') {
        break;
      }
      if (token.type === 'and') {
        this.#next();
      }
      children.push(this.parseNot());
    }
    return children.length === 1 ? children[0] : { type: 'and', children };
  }

  parseNot(): FilterNode {
    const token = this.#next();
    if (token == null) {
      throw new FilterSyntaxError(t('filter.error.missingOperand'));
    }
    switch (token.type) {
      case 'not':
        return { type: 'not', child: this.parseNot() };
      case 'lparen': {
        if (this.peek()?.type === 'rparen') {
          throw new FilterSyntaxError(t('filter.error.emptyParens'));
        }
        const inner = this.parseOr();
        if (this.#next()?.type !== 'rparen') {
          throw new FilterSyntaxError(t('filter.error.unclosed'));
        }
        return inner;
      }
      case 'term': {
        const term: FilterNode = { type: 'term', key: token.key ?? null, value: token.value ?? '' };
        return token.negated ? { type: 'not', child: term } : term;
      }
      case 'rparen':
        throw new FilterSyntaxError(t('filter.error.extraParen'));
      default:
        throw new FilterSyntaxError(t('filter.error.missingOperand'));
    }
  }
}

// --- evaluation ------------------------------------------------------------

interface PreparedItem {
  kind: ItemKind;
  name: string;
  slugs: string[];
  flags: string[];
  runtime: string;
  state: string;
  tags: string[];
  haystack: string;
}

function prepare(item: FilterItem): PreparedItem {
  const name = normalise(item.name);
  const slugs = item.slugs.map(normalise);
  const flags = (item.flags ?? []).map(normalise);
  const runtime = normalise(item.runtime);
  const tags = item.tags.map(normalise);
  const extra = (item.extra ?? []).map(normalise);
  return {
    kind: item.kind,
    name,
    slugs,
    flags,
    runtime,
    state: item.state == null ? '' : normalise(item.state),
    tags,
    haystack: [name, runtime, ...tags, ...extra].join(' '),
  };
}

function evaluate(node: FilterNode, item: PreparedItem): boolean {
  switch (node.type) {
    case 'and':
      return node.children.every((child) => evaluate(child, item));
    case 'or':
      return node.children.some((child) => evaluate(child, item));
    case 'not':
      return !evaluate(node.child, item);
    case 'term':
      return evaluateTerm(node.key, node.value, item);
  }
}

function evaluateTerm(key: string | null, value: string, item: PreparedItem): boolean {
  if (key == null) {
    return item.haystack.includes(value);
  }
  switch (key) {
    case 'is':
      if (value === 'app' || value === 'application') {
        return item.kind === 'app';
      }
      if (value === 'addon' || value === 'add-on') {
        return item.kind === 'addon';
      }
      if (item.flags.includes(value)) {
        return true;
      }
      return item.slugs.some((slug) => slug === value || slug.startsWith(value));
    case 'has':
      return item.tags.some((tag) => tag.startsWith(`${value}:`));
    case 'tag':
      return item.tags.some((tag) => tag === value || tag.startsWith(value));
    case 'runtime':
      return item.runtime.includes(value) || item.slugs.some((slug) => slug.includes(value));
    case 'state':
      return item.state.includes(value);
    case 'name':
      return item.name.includes(value);
    default:
      return item.tags.some((tag) => tag === `${key}:${value}` || tag.startsWith(`${key}:${value}:`));
  }
}
