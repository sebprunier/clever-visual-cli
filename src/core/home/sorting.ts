/**
 * Sorting of the home list by column, the way a spreadsheet does it: one
 * column, one direction, applied inside every leaf group. Applications come
 * first, then add-ons, each sorted on their own; a column that means nothing
 * for an add-on (state, activity) falls back to its name, and a missing value
 * (no deployment yet, no cost known) goes last whatever the direction.
 * Sorting by cost also orders the groups by their total; the other columns
 * leave the groups as the grouping built them: an explicit order such as
 * `env(prod,dev)` first, then alphabetical, the "missing" group last.
 */
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import type { AppActivity } from './activity.js';
import { nodeCost, shownCost, type CostTable } from './costs.js';
import { linkedAddons, linkedApps, type GroupNode, type GroupingContext } from './grouping.js';

export type SortColumn = 'name' | 'type' | 'state' | 'activity' | 'links' | 'cost';
export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  column: SortColumn;
  direction: SortDirection;
}

export const SORT_COLUMNS: readonly SortColumn[] = ['name', 'type', 'state', 'activity', 'links', 'cost'];

export interface SortContext {
  activity: ReadonlyMap<string, AppActivity>;
  grouping: Pick<GroupingContext, 'apps' | 'addons' | 'links'>;
  costs: CostTable | null;
}

type Key = string | number | null;

const STATE_RANK: Record<string, number> = { SHOULD_BE_UP: 0, WANTS_TO_BE_UP: 1, SHOULD_BE_DOWN: 2 };

/** Latest activity and biggest costs first; the rest reads alphabetically. */
export function defaultDirection(column: SortColumn): SortDirection {
  return column === 'activity' || column === 'cost' ? 'desc' : 'asc';
}

/** After a click on a header: a new column takes its natural direction, the same column flips. */
export function toggleSort(current: SortSpec, column: SortColumn): SortSpec {
  if (current.column !== column) {
    return { column, direction: defaultDirection(column) };
  }
  return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

export function sortApps(
  apps: readonly ApplicationSummary[],
  spec: SortSpec,
  context: SortContext,
): ApplicationSummary[] {
  return sortBy(apps, spec, (app) => appKey(app, spec.column, context));
}

export function sortAddons(addons: readonly AddonSummary[], spec: SortSpec, context: SortContext): AddonSummary[] {
  return sortBy(addons, spec, (addon) => addonKey(addon, spec.column, context));
}

/** The tree with every level and leaf sorted, as new nodes: the input is left alone. */
export function sortNodes(nodes: readonly GroupNode[], spec: SortSpec, context: SortContext): GroupNode[] {
  const sorted = nodes.map((node) => ({
    ...node,
    apps: sortApps(node.apps, spec, context),
    addons: sortAddons(node.addons, spec, context),
    children: sortNodes(node.children, spec, context),
  }));
  const costs = spec.column === 'cost' ? context.costs : null;
  if (costs == null) {
    return sorted;
  }
  const sign = spec.direction === 'asc' ? 1 : -1;
  return sorted.sort((a, b) => {
    if (a.missing !== b.missing) {
      return Number(a.missing) - Number(b.missing);
    }
    return (nodeCost(a, costs) - nodeCost(b, costs)) * sign || a.label.localeCompare(b.label, 'fr');
  });
}

function sortBy<T extends { name: string }>(items: readonly T[], spec: SortSpec, key: (item: T) => Key): T[] {
  const sign = spec.direction === 'asc' ? 1 : -1;
  const keyed = items.map((item) => ({ item, key: key(item) }));
  keyed.sort((a, b) => compareKeys(a.key, b.key, sign) || a.item.name.localeCompare(b.item.name, 'fr'));
  return keyed.map((entry) => entry.item);
}

/** Missing values last whatever the direction. */
function compareKeys(a: Key, b: Key, sign: number): number {
  if (a == null || b == null) {
    return a == null && b == null ? 0 : a == null ? 1 : -1;
  }
  const order = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'fr') : Number(a) - Number(b);
  return order * sign;
}

function appKey(app: ApplicationSummary, column: SortColumn, context: SortContext): Key {
  switch (column) {
    case 'name':
      return app.name;
    case 'type':
      return app.variantName;
    case 'state':
      return STATE_RANK[app.state] ?? 3;
    case 'activity':
      return context.activity.get(app.id)?.last.date ?? null;
    case 'links':
      return linkedAddons(app.id, context.grouping).length;
    case 'cost':
      return context.costs == null ? null : shownCost(context.costs, app);
  }
}

function addonKey(addon: AddonSummary, column: SortColumn, context: SortContext): Key {
  switch (column) {
    case 'name':
      return addon.name;
    case 'type':
      return addon.providerId;
    case 'state':
    case 'activity':
      return null;
    case 'links':
      return linkedApps(addon.id, context.grouping).length;
    case 'cost':
      return context.costs == null ? null : shownCost(context.costs, addon);
  }
}
