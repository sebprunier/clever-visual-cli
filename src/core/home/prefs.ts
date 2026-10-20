/**
 * Display preferences of the home list, per organisation, in localStorage
 * (`cvc.home.<ownerId>`). The home page and the column of an application
 * page read the same ones, so both show the list in the same shape.
 */
import { COST_SOURCES, type CostSource } from './costs.js';
import { SORT_COLUMNS, type SortColumn, type SortSpec } from './sorting.js';

export interface HomePrefs {
  /** The last grouping expression, used when the URL carries none. */
  grouping: string | null;
  sort: SortSpec;
  showAddons: boolean;
  /** Paths of the collapsed groups. */
  collapsed: string[];
  costs: boolean;
  costSource: CostSource;
}

export const DEFAULT_PREFS: HomePrefs = {
  grouping: null,
  sort: { column: 'name', direction: 'asc' },
  showAddons: true,
  collapsed: [],
  costs: false,
  costSource: 'days30',
};

function prefsKey(ownerId: string): string {
  return `cvc.home.${ownerId}`;
}

export function readPrefs(ownerId: string): HomePrefs {
  try {
    const raw = localStorage.getItem(prefsKey(ownerId));
    if (raw == null) {
      return DEFAULT_PREFS;
    }
    const parsed = JSON.parse(raw) as Partial<HomePrefs>;
    return {
      grouping: typeof parsed.grouping === 'string' ? parsed.grouping : null,
      sort: readSort(parsed.sort),
      showAddons: parsed.showAddons !== false,
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.filter((id) => typeof id === 'string') : [],
      costs: parsed.costs === true,
      costSource: COST_SOURCES.includes(parsed.costSource as CostSource) ? (parsed.costSource as CostSource) : 'days30',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Accepts a stored spec, and the `name` / `activity` words of the toggle that came before the column headers. */
export function readSort(value: unknown): SortSpec {
  if (value === 'activity') {
    return { column: 'activity', direction: 'desc' };
  }
  if (typeof value === 'object' && value != null) {
    const { column, direction } = value as Partial<SortSpec>;
    if (SORT_COLUMNS.includes(column as SortColumn)) {
      return { column: column as SortColumn, direction: direction === 'desc' ? 'desc' : 'asc' };
    }
  }
  return DEFAULT_PREFS.sort;
}

export function writePrefs(ownerId: string, prefs: HomePrefs): void {
  try {
    localStorage.setItem(prefsKey(ownerId), JSON.stringify(prefs));
  } catch {
    // Not essential.
  }
}

/** Collapses an expanded group, expands a collapsed one. */
export function toggleCollapsed(prefs: HomePrefs, path: string): HomePrefs {
  const collapsed = prefs.collapsed.includes(path)
    ? prefs.collapsed.filter((candidate) => candidate !== path)
    : [...prefs.collapsed, path];
  return { ...prefs, collapsed };
}
