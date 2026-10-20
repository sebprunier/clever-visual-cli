/**
 * The home list as a function of its inputs: which applications and add-ons
 * the filter keeps, how the grouping arranges them, in which order. The home
 * page and the column of an application page build the same list from it.
 */
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import { watchList, type AppActivity, type WatchItem } from './activity.js';
import type { CostTable } from './costs.js';
import { matchesFilter, parseFilter, type ParsedFilter } from './filter.js';
import {
  buildTree,
  linkedAddons,
  parseGrouping,
  type GroupNode,
  type GroupingContext,
  type LinksIndex,
  type ParsedGrouping,
} from './grouping.js';
import { sortNodes, type SortSpec } from './sorting.js';

export interface HomeListInput {
  /** Applications of the organisation, archived ones left out. */
  apps: readonly ApplicationSummary[];
  addons: readonly AddonSummary[];
  links: LinksIndex;
  activity: ReadonlyMap<string, AppActivity>;
  filterText: string;
  groupingText: string;
  showAddons: boolean;
  sort: SortSpec;
  /** The cost table of the selected source, for a sort by cost. */
  costs: CostTable | null;
  stateLabel: GroupingContext['stateLabel'];
}

export interface HomeList {
  context: GroupingContext;
  filter: ParsedFilter;
  grouping: ParsedGrouping;
  /** What deserves attention, whatever the filter. */
  watch: WatchItem[];
  visibleApps: ApplicationSummary[];
  visibleAddons: AddonSummary[];
  /** The groups, sorted; one level-0 node when the grouping is empty. */
  tree: GroupNode[];
}

export function buildHomeList(input: HomeListInput): HomeList {
  const { apps, addons, activity } = input;
  const context: GroupingContext = { apps, addons, links: input.links, stateLabel: input.stateLabel };
  const filter = parseFilter(input.filterText);
  const watch = watchList(apps, activity);
  const watchIds = new Set(watch.map((item) => item.app.id));
  const visibleApps = apps.filter((app) =>
    matchesFilter(filter, {
      kind: 'app',
      name: app.name,
      slugs: [app.variantSlug, app.instanceType],
      runtime: app.variantName,
      state: input.stateLabel(app.state),
      tags: app.customerTags,
      extra: [app.id, ...linkedAddons(app.id, context).map((addon) => addon.name)],
      flags: watchIds.has(app.id) ? ['watch'] : [],
    }),
  );
  const visibleAddons = input.showAddons
    ? addons.filter((addon) =>
        matchesFilter(filter, {
          kind: 'addon',
          name: addon.name,
          slugs: [addon.providerId, addon.providerId.replace(/-addon$/, '')],
          runtime: addon.providerId,
          tags: addon.customerTags,
          extra: [addon.id, addon.realId],
        }),
      )
    : [];
  const grouping = parseGrouping(input.groupingText);
  const tree = sortNodes(buildTree(grouping, visibleApps, visibleAddons, context), input.sort, {
    activity,
    grouping: context,
    costs: input.costs,
  });
  return { context, filter, grouping, watch, visibleApps, visibleAddons, tree };
}

/** Ids of the rows a reader sees, in display order: the content of collapsed groups is left out. */
export function displayOrder(nodes: readonly GroupNode[], collapsed: readonly string[]): string[] {
  const order: string[] = [];
  const walk = (node: GroupNode) => {
    if (node.level > 0 && collapsed.includes(node.path)) {
      return;
    }
    if (node.children.length > 0) {
      node.children.forEach(walk);
      return;
    }
    order.push(...node.apps.map((app) => app.id), ...node.addons.map((addon) => addon.id));
  };
  nodes.forEach(walk);
  return order;
}
