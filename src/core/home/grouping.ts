/**
 * Grouping expressions of the home page: `project`, `project > env`,
 * `env(prod,qua,dev) > runtime`, up to three levels.
 *
 * A key is either a tag key (`project` reads `project:<value>` or
 * `project:<value>:…` tags, the value being the first segment) or one of
 * the built-ins `type`, `runtime`, `provider`, `state`. An optional
 * `key(a,b,c)` fixes the order of the first groups; the others follow in
 * alphabetical order, and the items without a value come last in a
 * "sans <key>" group. An item with two values for a key appears in both
 * groups. An add-on without a tag for a key inherits the values of the
 * applications linked to it, and is marked as inferred.
 */
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import { normalise } from '../palette.js';

export const MAX_LEVELS = 3;
export const BUILTIN_KEYS: ReadonlyArray<{ key: string; hint: string }> = [
  { key: 'type', hint: 'applications puis add-ons' },
  { key: 'runtime', hint: 'runtime des applications, fournisseur des add-ons' },
  { key: 'provider', hint: 'fournisseur des add-ons' },
  { key: 'state', hint: 'état des applications' },
];

/** Providers typically shared across unrelated applications: shown dimmed among linked add-ons. */
export const WEAK_LINK_PROVIDERS: ReadonlySet<string> = new Set([
  'config-provider',
  'keycloak',
  'otoroshi',
  'jenkins',
  'matomo',
  'metabase',
  'grafana',
]);

export interface AppLinks {
  addonIds: string[];
  applicationIds: string[];
}

export type LinksIndex = Readonly<Record<string, AppLinks>>;

export interface GroupKey {
  key: string;
  /** Normalised values to put first, in this order. */
  order: string[];
}

export interface ParsedGrouping {
  raw: string;
  keys: GroupKey[];
  error: string | null;
}

export interface GroupingContext {
  apps: readonly ApplicationSummary[];
  addons: readonly AddonSummary[];
  /** Links per application id; may be incomplete while they load. */
  links: LinksIndex;
  stateLabel: (state: ApplicationSummary['state']) => string;
}

export interface GroupNode {
  /** `project=shop/env=prod`, stable across renders, used to remember collapsed groups. */
  path: string;
  /** 0 for the single node of an empty grouping, then 1 to `MAX_LEVELS`. */
  level: number;
  label: string;
  /** True for the "sans <key>" group. */
  missing: boolean;
  /** Leaf items, sorted by name. Empty on a node with children. */
  apps: ApplicationSummary[];
  addons: AddonSummary[];
  /** Ids of the add-ons placed here through their linked applications rather than their own tags. */
  inferred: ReadonlySet<string>;
  children: GroupNode[];
  appCount: number;
  addonCount: number;
}

// --- expression ------------------------------------------------------------

export function parseGrouping(raw: string): ParsedGrouping {
  const parts = splitLevels(raw).filter(
    (part, index, all) => !(part === '' && index === all.length - 1 && all.length > 1),
  );
  if (parts.length === 1 && parts[0] === '') {
    return { raw, keys: [], error: null };
  }
  const keys: GroupKey[] = [];
  for (const part of parts) {
    const match = /^([^\s()]+)\s*(?:\(([^()]*)\))?$/.exec(part);
    if (match == null) {
      return { raw, keys, error: part === '' ? 'clé vide' : `syntaxe attendue : clé ou clé(valeur, valeur)` };
    }
    const key = normalise(match[1]);
    if (keys.some((candidate) => candidate.key === key)) {
      return { raw, keys, error: `clé « ${match[1]} » en double` };
    }
    const order = (match[2] ?? '')
      .split(',')
      .map((value) => normalise(value))
      .filter((value) => value !== '');
    keys.push({ key, order });
  }
  if (keys.length > MAX_LEVELS) {
    return { raw, keys: keys.slice(0, MAX_LEVELS), error: `${MAX_LEVELS} niveaux maximum` };
  }
  return { raw, keys, error: null };
}

/** Splits on `>` or `,` outside parentheses, trimming each part. */
function splitLevels(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of raw) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    }
    if ((char === '>' || char === ',') && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

/** Tag keys in use in the organisation, most used first. */
export function tagKeys(items: ReadonlyArray<{ customerTags: string[] }>): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.customerTags) {
      const colon = tag.indexOf(':');
      if (colon > 0) {
        const key = normalise(tag.slice(0, colon));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key]) => key);
}

/** What to suggest in the grouping field: tag keys, their pairs, then the built-ins. */
export function groupingSuggestions(items: ReadonlyArray<{ customerTags: string[] }>): string[] {
  const keys = tagKeys(items);
  const suggestions = [...keys];
  if (keys.includes('project') && keys.includes('env')) {
    suggestions.push('project > env', 'env > project');
  } else if (keys.length >= 2) {
    suggestions.push(`${keys[0]} > ${keys[1]}`);
  }
  for (const builtin of BUILTIN_KEYS) {
    suggestions.push(builtin.key);
  }
  return suggestions;
}

/** `project` when the organisation uses that tag, else `type`. */
export function defaultGrouping(items: ReadonlyArray<{ customerTags: string[] }>): string {
  const keys = tagKeys(items);
  return keys.includes('project') ? 'project' : 'type';
}

// --- links -----------------------------------------------------------------

export function isWeak(addon: AddonSummary): boolean {
  return WEAK_LINK_PROVIDERS.has(addon.providerId);
}

/** Add-ons linked to an application, strong ones first, in the order of the add-on list. */
export function linkedAddons(appId: string, context: Pick<GroupingContext, 'addons' | 'links'>): AddonSummary[] {
  const ids = new Set(context.links[appId]?.addonIds ?? []);
  const linked = context.addons.filter((addon) => ids.has(addon.id));
  return linked.sort((a, b) => Number(isWeak(a)) - Number(isWeak(b)));
}

/** Applications linked to an add-on. */
export function linkedApps(addonId: string, context: Pick<GroupingContext, 'apps' | 'links'>): ApplicationSummary[] {
  return context.apps.filter((app) => context.links[app.id]?.addonIds.includes(addonId));
}

// --- tree ------------------------------------------------------------------

type Item = { kind: 'app'; app: ApplicationSummary } | { kind: 'addon'; addon: AddonSummary };

interface Values {
  /** Display label by normalised value. */
  values: Map<string, string>;
  inferred: boolean;
}

/**
 * Groups the given applications and add-ons (already filtered) by the keys of
 * the grouping. Returns the top-level nodes, or one level-0 node holding
 * everything when the grouping is empty.
 */
export function buildTree(
  grouping: ParsedGrouping,
  apps: readonly ApplicationSummary[],
  addons: readonly AddonSummary[],
  context: GroupingContext,
): GroupNode[] {
  const items: Item[] = [
    ...apps.map((app): Item => ({ kind: 'app', app })),
    ...addons.map((addon): Item => ({ kind: 'addon', addon })),
  ];
  if (grouping.keys.length === 0) {
    return [leaf('', 0, '', false, items, new Set())];
  }
  return build(items, grouping.keys, 1, '', new Set(), context);
}

function build(
  items: Item[],
  keys: GroupKey[],
  level: number,
  parentPath: string,
  inherited: ReadonlySet<string>,
  context: GroupingContext,
): GroupNode[] {
  const { key, order } = keys[level - 1];
  const buckets = new Map<string, { label: string; items: Item[]; inferred: Set<string> }>();
  const missing: Item[] = [];
  for (const item of items) {
    const { values, inferred } = valuesOf(item, key, context);
    if (values.size === 0) {
      missing.push(item);
      continue;
    }
    for (const [value, label] of values) {
      let bucket = buckets.get(value);
      if (bucket == null) {
        bucket = { label, items: [], inferred: new Set() };
        buckets.set(value, bucket);
      }
      bucket.items.push(item);
      if (inferred && item.kind === 'addon') {
        bucket.inferred.add(item.addon.id);
      }
    }
  }
  const rank = (value: string) => {
    const index = order.indexOf(value);
    return index === -1 ? order.length : index;
  };
  const sorted = [...buckets.entries()].sort(
    ([a, bucketA], [b, bucketB]) => rank(a) - rank(b) || bucketA.label.localeCompare(bucketB.label, 'fr'),
  );
  const nodes = sorted.map(([value, bucket]) =>
    node(
      `${parentPath}${key}=${value}`,
      level,
      bucket.label,
      false,
      bucket.items,
      union(inherited, bucket.inferred),
      keys,
      context,
    ),
  );
  if (missing.length > 0) {
    nodes.push(node(`${parentPath}${key}=`, level, `sans ${key}`, true, missing, inherited, keys, context));
  }
  return nodes;
}

function node(
  path: string,
  level: number,
  label: string,
  missing: boolean,
  items: Item[],
  inferred: ReadonlySet<string>,
  keys: GroupKey[],
  context: GroupingContext,
): GroupNode {
  if (level < keys.length) {
    const children = build(items, keys, level + 1, `${path}/`, inferred, context);
    return {
      path,
      level,
      label,
      missing,
      apps: [],
      addons: [],
      inferred,
      children,
      appCount: items.filter((item) => item.kind === 'app').length,
      addonCount: items.filter((item) => item.kind === 'addon').length,
    };
  }
  return leaf(path, level, label, missing, items, inferred);
}

function leaf(
  path: string,
  level: number,
  label: string,
  missing: boolean,
  items: Item[],
  inferred: ReadonlySet<string>,
): GroupNode {
  const apps = items
    .filter((item): item is Extract<Item, { kind: 'app' }> => item.kind === 'app')
    .map((item) => item.app)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const addons = items
    .filter((item): item is Extract<Item, { kind: 'addon' }> => item.kind === 'addon')
    .map((item) => item.addon)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return {
    path,
    level,
    label,
    missing,
    apps,
    addons,
    inferred: new Set([...inferred].filter((id) => addons.some((addon) => addon.id === id))),
    children: [],
    appCount: apps.length,
    addonCount: addons.length,
  };
}

function valuesOf(item: Item, key: string, context: GroupingContext): Values {
  const values = new Map<string, string>();
  const put = (label: string) => {
    const value = normalise(label);
    if (value !== '' && !values.has(value)) {
      values.set(value, label);
    }
  };
  switch (key) {
    case 'type':
      put(item.kind === 'app' ? 'Applications' : 'Add-ons');
      return { values, inferred: false };
    case 'runtime':
      put(item.kind === 'app' ? item.app.variantName : item.addon.providerId);
      return { values, inferred: false };
    case 'provider':
      if (item.kind === 'addon') {
        put(item.addon.providerId);
      }
      return { values, inferred: false };
    case 'state':
      put(item.kind === 'app' ? context.stateLabel(item.app.state) : 'add-on');
      return { values, inferred: false };
    default: {
      const tags = item.kind === 'app' ? item.app.customerTags : item.addon.customerTags;
      for (const tag of tags) {
        const value = tagValue(tag, key);
        if (value != null) {
          put(value);
        }
      }
      if (values.size > 0 || item.kind === 'app') {
        return { values, inferred: false };
      }
      for (const app of linkedApps(item.addon.id, context)) {
        for (const tag of app.customerTags) {
          const value = tagValue(tag, key);
          if (value != null) {
            put(value);
          }
        }
      }
      return { values, inferred: values.size > 0 };
    }
  }
}

/** `project:shop:prod` with key `project` → `shop`; `env:prod` with key `env` → `prod`; otherwise null. */
export function tagValue(tag: string, key: string): string | null {
  const colon = tag.indexOf(':');
  if (colon <= 0 || normalise(tag.slice(0, colon)) !== key) {
    return null;
  }
  const rest = tag.slice(colon + 1);
  const next = rest.indexOf(':');
  const value = next === -1 ? rest : rest.slice(0, next);
  return value === '' ? null : value;
}

function union(a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> {
  return new Set([...a, ...b]);
}
