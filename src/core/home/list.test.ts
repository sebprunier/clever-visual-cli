import { beforeAll, describe, expect, it } from 'vitest';
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import { setLocale } from '../i18n.js';
import { buildHomeList, displayOrder, type HomeListInput } from './list.js';
import { DEFAULT_PREFS, toggleCollapsed } from './prefs.js';

// The "missing" group label is translated: pin the language, whatever the machine's.
beforeAll(() => setLocale('fr', false));

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
    // Without the add-ons: a filter term, which a favourite view or a link keeps.
    expect(buildHomeList(input({ filterText: 'project:shop -is:addon' })).visibleAddons).toEqual([]);
  });

  it('groups and sorts the way the home page does', () => {
    const list = buildHomeList(input({ groupingText: 'project' }));
    expect(list.tree.map((node) => node.label)).toEqual(['shop', 'sans project']);
    expect(list.tree[0].apps.map((item) => item.id)).toEqual(['shop-dev', 'shop-prod']);
    const desc = buildHomeList(input({ groupingText: 'project', sort: { column: 'name', direction: 'desc' } }));
    expect(desc.tree[0].apps.map((item) => item.id)).toEqual(['shop-prod', 'shop-dev']);
  });

  it('lists the archived applications only for is:archived', () => {
    const archivedApps = [{ ...app('old-shop', ['project:shop']), isArchived: true }];
    expect(buildHomeList(input({ archivedApps, filterText: 'project:shop' })).visibleApps.map((a) => a.id)).toEqual([
      'shop-prod',
      'shop-dev',
    ]);
    expect(buildHomeList(input({ archivedApps, filterText: 'is:archived' })).visibleApps.map((a) => a.id)).toEqual([
      'old-shop',
    ]);
    const both = buildHomeList(input({ archivedApps, filterText: 'project:shop (is:archived OR -is:archived)' }));
    expect(both.visibleApps.map((a) => a.id)).toEqual(['shop-prod', 'shop-dev', 'old-shop']);
  });

  it('reports expression errors without losing the list', () => {
    const list = buildHomeList(input({ filterText: '(blog', groupingText: 'project > project' }));
    expect(list.filter.error).not.toBeNull();
    expect(list.grouping.error).not.toBeNull();
  });
});

describe('add-on states', () => {
  const states = input({
    addonState: (addon) => (addon.id === 'shop-db' ? 'shared' : null),
    addonStateLabel: (state) => (state === 'shared' ? 'mutualisé' : state),
  });

  it('filter with is:shared and state:, and group by state', () => {
    expect(buildHomeList({ ...states, filterText: 'is:shared' }).visibleAddons.map((addon) => addon.id)).toEqual([
      'shop-db',
    ]);
    expect(buildHomeList({ ...states, filterText: 'state:mutualise' }).visibleAddons).toHaveLength(1);
    const { tree } = buildHomeList({ ...states, groupingText: 'state' });
    expect(tree.find((node) => node.label === 'mutualisé')?.addons.map((addon) => addon.id)).toEqual(['shop-db']);
  });
});

describe('databases to watch', () => {
  it('lists a database on a retired version and lets is:watch find it', () => {
    const list = buildHomeList(
      input({
        filterText: 'is:watch',
        dbVersion: (addon) => (addon.id === 'shop-db' ? '11' : null),
        offeredVersions: () => ['13', '14', '15'],
      }),
    );
    expect(list.addonWatch.map((item) => [item.addon.id, item.kind === 'retired' ? item.version : null])).toEqual([
      ['shop-db', '11'],
    ]);
    expect(list.visibleAddons.map((addon) => addon.id)).toEqual(['shop-db']);
    expect(list.visibleApps).toEqual([]);
  });

  it('lists an operator with an update out', () => {
    const list = buildHomeList(
      input({
        addons: [
          {
            id: 'auth',
            realId: 'keycloak_1',
            name: 'auth',
            providerId: 'keycloak',
            customerTags: [],
          } as unknown as AddonSummary,
        ],
        filterText: 'is:watch',
        operatorVersions: () => ({
          installed: '26.7.2',
          latest: '26.8.0',
          available: ['26.8.0'],
          needUpdate: true,
          followsLatest: false,
        }),
      }),
    );
    expect(list.addonWatch.map((item) => [item.kind, item.addon.id])).toEqual([['update', 'auth']]);
    expect(list.visibleAddons.map((addon) => addon.id)).toEqual(['auth']);
  });

  it('lists nothing while versions are unknown', () => {
    expect(buildHomeList(input({})).addonWatch).toEqual([]);
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
