import { describe, expect, it } from 'vitest';
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import { buildHomeList, displayOrder, type HomeListInput } from './list.js';
import { DEFAULT_PREFS, toggleCollapsed } from './prefs.js';

const app = (id: string, tags: string[] = [], state = 'SHOULD_BE_UP') =>
  ({
    id,
    name: id,
    variantSlug: 'node',
    instanceType: 'node',
    variantName: 'Node',
    state,
    customerTags: tags,
    isArchived: false,
  }) as unknown as ApplicationSummary;
const addon = (id: string, tags: string[] = []) =>
  ({ id, realId: `pg_${id}`, name: id, providerId: 'postgresql-addon', customerTags: tags }) as unknown as AddonSummary;

function input(partial: Partial<HomeListInput>): HomeListInput {
  return {
    apps: [app('shop-prod', ['project:shop', 'env:prod']), app('shop-dev', ['project:shop', 'env:dev']), app('blog')],
    addons: [addon('shop-db', ['project:shop'])],
    links: {},
    activity: new Map(),
    filterText: '',
    groupingText: '',
    showAddons: true,
    sort: DEFAULT_PREFS.sort,
    costs: null,
    stateLabel: (state) => (state === 'SHOULD_BE_UP' ? 'up' : 'stopped'),
    ...partial,
  };
}

describe('buildHomeList', () => {
  it('keeps what the filter matches, add-ons included unless hidden', () => {
    const list = buildHomeList(input({ filterText: 'project:shop' }));
    expect(list.visibleApps.map((item) => item.id)).toEqual(['shop-prod', 'shop-dev']);
    expect(list.visibleAddons.map((item) => item.id)).toEqual(['shop-db']);
    expect(buildHomeList(input({ filterText: 'project:shop', showAddons: false })).visibleAddons).toEqual([]);
  });

  it('groups and sorts the way the home page does', () => {
    const list = buildHomeList(input({ groupingText: 'project' }));
    expect(list.tree.map((node) => node.label)).toEqual(['shop', 'sans project']);
    expect(list.tree[0].apps.map((item) => item.id)).toEqual(['shop-dev', 'shop-prod']);
    const desc = buildHomeList(input({ groupingText: 'project', sort: { column: 'name', direction: 'desc' } }));
    expect(desc.tree[0].apps.map((item) => item.id)).toEqual(['shop-prod', 'shop-dev']);
  });

  it('reports expression errors without losing the list', () => {
    const list = buildHomeList(input({ filterText: '(blog', groupingText: 'project > project' }));
    expect(list.filter.error).not.toBeNull();
    expect(list.grouping.error).not.toBeNull();
  });
});

describe('displayOrder', () => {
  it('lists applications then add-ons of each group, leaving collapsed groups out', () => {
    const { tree } = buildHomeList(input({ groupingText: 'project' }));
    expect(displayOrder(tree, [])).toEqual(['shop-dev', 'shop-prod', 'shop-db', 'blog']);
    const collapsed = toggleCollapsed(DEFAULT_PREFS, tree[0].path).collapsed;
    expect(displayOrder(tree, collapsed)).toEqual(['blog']);
    expect(toggleCollapsed({ ...DEFAULT_PREFS, collapsed }, tree[0].path).collapsed).toEqual([]);
  });
});
