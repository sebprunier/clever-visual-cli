import { describe, expect, it } from 'vitest';
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import type { AppActivity } from './activity.js';
import { invoiceCosts } from './costs.js';
import type { GroupNode } from './grouping.js';
import { defaultDirection, sortAddons, sortApps, sortNodes, toggleSort, type SortContext } from './sorting.js';

const app = (name: string, extra: Partial<ApplicationSummary> = {}) =>
  ({ id: `app_${name}`, name, state: 'SHOULD_BE_UP', variantName: 'Node', ...extra }) as ApplicationSummary;
const addon = (name: string, providerId = 'postgresql-addon') =>
  ({ id: `addon_${name}`, realId: `pg_${name}`, name, providerId }) as AddonSummary;
const activity = (date: string) => ({ last: { date } }) as AppActivity;
const names = (items: ReadonlyArray<{ name: string }>) => items.map((item) => item.name);

const context: SortContext = {
  activity: new Map([
    ['app_a', activity('2026-10-01T00:00:00Z')],
    ['app_b', activity('2026-10-10T00:00:00Z')],
  ]),
  grouping: { apps: [], addons: [addon('db')], links: { app_a: { addonIds: ['addon_db'], applicationIds: [] } } },
  costs: invoiceCosts({
    number: 'F1',
    from: '',
    to: '',
    currency: 'EUR',
    rows: [
      { id: 'app_a', amount: 5 },
      { id: 'app_b', amount: 50 },
      { id: 'pg_db', amount: 20 },
    ],
  }),
};

describe('toggleSort', () => {
  it('starts a column in its natural direction and flips it on the second click', () => {
    expect(defaultDirection('activity')).toBe('desc');
    expect(toggleSort({ column: 'name', direction: 'asc' }, 'cost')).toEqual({ column: 'cost', direction: 'desc' });
    expect(toggleSort({ column: 'cost', direction: 'desc' }, 'cost')).toEqual({ column: 'cost', direction: 'asc' });
  });
});

describe('sortApps', () => {
  const apps = [app('c', { state: 'SHOULD_BE_DOWN' }), app('a'), app('b', { variantName: 'Docker' })];

  it('sorts by name in both directions', () => {
    expect(names(sortApps(apps, { column: 'name', direction: 'asc' }, context))).toEqual(['a', 'b', 'c']);
    expect(names(sortApps(apps, { column: 'name', direction: 'desc' }, context))).toEqual(['c', 'b', 'a']);
  });

  it('puts started applications first and breaks ties by name', () => {
    expect(names(sortApps(apps, { column: 'state', direction: 'asc' }, context))).toEqual(['a', 'b', 'c']);
    expect(names(sortApps(apps, { column: 'state', direction: 'desc' }, context))).toEqual(['c', 'a', 'b']);
    expect(names(sortApps(apps, { column: 'type', direction: 'asc' }, context))).toEqual(['b', 'a', 'c']);
  });

  it('keeps missing values last whatever the direction', () => {
    expect(names(sortApps(apps, { column: 'activity', direction: 'desc' }, context))).toEqual(['b', 'a', 'c']);
    expect(names(sortApps(apps, { column: 'activity', direction: 'asc' }, context))).toEqual(['a', 'b', 'c']);
    expect(names(sortApps(apps, { column: 'cost', direction: 'desc' }, context))).toEqual(['b', 'a', 'c']);
    expect(names(sortApps(apps, { column: 'cost', direction: 'asc' }, context))).toEqual(['c', 'a', 'b']);
  });

  it('counts the links', () => {
    expect(names(sortApps(apps, { column: 'links', direction: 'desc' }, context))).toEqual(['a', 'b', 'c']);
  });
});

describe('sortAddons', () => {
  it('falls back to the name for a column without meaning', () => {
    const addons = [addon('z'), addon('m', 'redis-addon')];
    expect(names(sortAddons(addons, { column: 'state', direction: 'desc' }, context))).toEqual(['m', 'z']);
    expect(names(sortAddons(addons, { column: 'type', direction: 'asc' }, context))).toEqual(['z', 'm']);
  });
});

describe('sortNodes', () => {
  const node = (partial: Partial<GroupNode>): GroupNode => ({
    path: 'x',
    level: 1,
    label: 'x',
    missing: false,
    apps: [],
    addons: [],
    inferred: new Set(),
    children: [],
    appCount: 0,
    addonCount: 0,
    ...partial,
  });
  // In the order the grouping built them: an explicit `env(prod,dev)` puts "beta" first here.
  const tree = [
    node({ path: 'q', label: 'beta', addons: [addon('db')] }),
    node({ path: 'p', label: 'alpha', apps: [app('b'), app('a')] }),
    node({ path: 'm', label: 'sans project', missing: true, apps: [app('x')] }),
  ];

  it('orders groups by their total when sorting by cost, the missing group last', () => {
    const desc = sortNodes(tree, { column: 'cost', direction: 'desc' }, context);
    expect(desc.map((group) => group.label)).toEqual(['alpha', 'beta', 'sans project']);
    expect(names(desc[0].apps)).toEqual(['b', 'a']);
    const asc = sortNodes(tree, { column: 'cost', direction: 'asc' }, context);
    expect(asc.map((group) => group.label)).toEqual(['beta', 'alpha', 'sans project']);
  });

  it('keeps the order of the grouping for the other columns and does not touch the input', () => {
    const sorted = sortNodes(tree, { column: 'name', direction: 'asc' }, context);
    expect(sorted.map((group) => group.label)).toEqual(['beta', 'alpha', 'sans project']);
    expect(names(sorted[1].apps)).toEqual(['a', 'b']);
    expect(names(tree[1].apps)).toEqual(['b', 'a']);
  });
});
