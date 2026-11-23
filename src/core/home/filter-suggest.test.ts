import { beforeAll, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n.js';
import { wordSpans, type FilterItem } from './filter.js';
import { acceptSuggestion, MAX_SUGGESTIONS, suggest } from './filter-suggest.js';

beforeAll(() => setLocale('en', false));

const app = (name: string, runtime: string, slug: string, tags: string[], flags: string[] = []): FilterItem => ({
  kind: 'app',
  name,
  slugs: [slug, slug],
  runtime,
  state: ['running', 'démarrée'],
  tags,
  flags,
});
const addon = (name: string, providerId: string, tags: string[]): FilterItem => ({
  kind: 'addon',
  name,
  slugs: [providerId, providerId.replace(/-addon$/, '')],
  runtime: providerId,
  tags,
});

const items: FilterItem[] = [
  app('shop-api', 'Node.js', 'node', ['project:shop', 'env:prod']),
  app('shop-front', 'Node.js', 'node', ['project:shop', 'env:dev'], ['failed', 'watch']),
  app('blog', 'PHP', 'php', ['project:mon projet', 'env:prod']),
  app('old-shop', 'Node.js', 'node', ['project:shop'], ['archived']),
  addon('shop-db', 'postgresql-addon', ['project:shop:prod']),
];

/** The suggestions with the caret at the end of the expression. */
const at = (raw: string) => suggest(raw, raw.length, items);
const texts = (raw: string) => at(raw)?.items.map((item) => item.text) ?? [];
const counted = (raw: string) => at(raw)?.items.map((item) => [item.text, item.count]) ?? [];

describe('wordSpans', () => {
  it('gives each word its place, a dash or quotes included, parentheses left out', () => {
    const raw = 'is:app (env:prod OR -"old stuff") -(a)';
    expect(wordSpans(raw).map(({ start, end }) => raw.slice(start, end))).toEqual([
      'is:app',
      'env:prod',
      'OR',
      '-"old stuff"',
      '-',
      'a',
    ]);
    expect(wordSpans('project:"mon proj').map(({ start, end }) => [start, end])).toEqual([[0, 17]]);
  });
});

describe('suggest (#45)', () => {
  it('suggests nothing on an empty field, after a space, or on free text no key holds', () => {
    expect(at('')).toBeNull();
    expect(at('is:app ')).toBeNull();
    expect(at('shop')).toBeNull();
    expect(at('-')).toBeNull();
    expect(at('"two wo')).toBeNull();
  });

  it('suggests the keys, then the tag keys of the organisation', () => {
    expect(texts('i')[0]).toBe('is:');
    expect(at('i')?.items[0]).toEqual({ text: 'is:', key: true, count: null });
    expect(texts('e')).toEqual(['env:', 'runtime:', 'state:', 'name:', 'project:']);
    expect(texts('pro')).toEqual(['project:']);
  });

  it('suggests the words of is:, then the slugs present, with what each keeps', () => {
    expect(counted('is:')).toEqual([
      ['is:app', 3],
      ['is:addon', 1],
      ['is:watch', 1],
      ['is:failed', 1],
      ['is:archived', 1],
      ['is:node', 2],
      ['is:php', 1],
      ['is:postgresql', 1],
    ]);
    // Nothing deploying, nothing shared: left out. The `-addon` slug gives way to the short one.
    expect(texts('is:po')).toEqual(['is:postgresql']);
    expect(texts('IS:Fa')).toEqual(['is:failed']);
  });

  it('keeps a leading dash, and counts what the negated term keeps', () => {
    expect(counted('-is:a')).toEqual([
      ['-is:app', 1],
      ['-is:addon', 3],
      ['-is:archived', 4],
      ['-is:watch', 3],
      ['-is:failed', 3],
    ]);
  });

  it('suggests the values of a tag key, segment by segment, quoted when they hold a space', () => {
    expect(counted('env:')).toEqual([
      ['env:prod', 2],
      ['env:dev', 1],
    ]);
    expect(counted('project:')).toEqual([
      ['project:shop', 3],
      ['project:"mon projet"', 1],
      ['project:shop:prod', 1],
    ]);
    expect(texts('project:"mon')).toEqual(['project:"mon projet"']);
    expect(texts('team:')).toEqual([]);
  });

  it('suggests the values of has:, tag:, runtime:, state: and name:', () => {
    expect(texts('has:')).toEqual(['has:project', 'has:env']);
    expect(texts('tag:env')).toEqual(['tag:env:prod', 'tag:env:dev']);
    expect(counted('runtime:')).toEqual([
      ['runtime:Node.js', 2],
      ['runtime:PHP', 1],
      ['runtime:postgresql-addon', 1],
    ]);
    // Only the states some resource is in.
    expect(counted('state:')).toEqual([['state:running', 3]]);
    // An archived application is listed only for is:archived: name:old-shop alone keeps nothing.
    expect(texts('name:shop')).toEqual(['name:shop-api', 'name:shop-db', 'name:shop-front']);
  });

  it('puts the words that start with the text before the ones that contain it', () => {
    expect(texts('tag:pro')).toEqual([
      'tag:project:shop',
      'tag:"project:mon projet"',
      'tag:project:shop:prod',
      'tag:env:prod',
    ]);
    expect(texts('name:b')).toEqual(['name:blog', 'name:shop-db']);
  });

  it('suggests the operators once a term is there', () => {
    expect(texts('is:app o')).toEqual(['OR', 'project:']);
    expect(texts('is:app a')).toEqual(['AND', 'has:', 'tag:', 'state:', 'name:']);
    expect(texts('o')).toEqual(['project:']);
    expect(texts('is:app -n')).toEqual(['-name:', '-runtime:', '-env:']);
  });

  it('reads the word under the caret, inside parentheses and in the middle of the expression', () => {
    const raw = '(is:app OR st';
    expect(suggest(raw, raw.length, items)).toMatchObject({ from: 11, to: 13, items: [{ text: 'state:' }] });
    const middle = 'is:ap env:prod';
    expect(suggest(middle, 5, items)).toMatchObject({ from: 0, to: 5, items: [{ text: 'is:app' }] });
    expect(suggest(middle, 6, items)).toBeNull();
  });

  it('shows at most eight suggestions', () => {
    const many = Array.from({ length: 12 }, (_, index) => app(`app-${index}`, 'Node.js', 'node', []));
    expect(suggest('name:app', 8, many)?.items).toHaveLength(MAX_SUGGESTIONS);
  });
});

describe('acceptSuggestion', () => {
  const accept = (raw: string, caret: number, text: string, key = false) => {
    const suggestions = suggest(raw, caret, items);
    expect(suggestions).not.toBeNull();
    return acceptSuggestion(raw, suggestions!, { text, key, count: null });
  };

  it('leaves a key open for its value', () => {
    expect(accept('i', 1, 'is:', true)).toEqual({ text: 'is:', caret: 3 });
  });

  it('follows a full term with a space, or steps over the one already there', () => {
    expect(accept('is:fa', 5, 'is:failed')).toEqual({ text: 'is:failed ', caret: 10 });
    expect(accept('is:ap env:prod', 5, 'is:app')).toEqual({ text: 'is:app env:prod', caret: 7 });
  });

  it('adds no space before a closing parenthesis', () => {
    expect(accept('(is:app OR is:fa)', 16, 'is:failed')).toEqual({ text: '(is:app OR is:failed)', caret: 20 });
  });
});
