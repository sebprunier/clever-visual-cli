/**
 * How the home page groups applications and add-ons.
 *
 * `stack` follows the links the platform knows: applications linked to each
 * other, directly or through a shared add-on, form a named stack. An
 * application that shares nothing stays in the flat list with its own
 * add-ons nested under it. Providers that are typically shared across
 * unrelated applications (configuration, SSO, gateways, monitoring) are
 * "weak" links: they are listed with the application but never merge two
 * groups.
 */
import type { AddonSummary, ApplicationSummary } from '../../data/api.js';
import { normalise } from '../palette.js';

export type GroupMode = 'none' | 'stack' | 'project' | 'runtime' | 'state';

export const GROUP_MODES: ReadonlyArray<{ id: GroupMode; label: string; hint: string }> = [
  { id: 'none', label: 'aucun', hint: 'Applications puis add-ons, à plat' },
  { id: 'stack', label: 'stack', hint: 'Applications et add-ons liés entre eux' },
  { id: 'project', label: 'projet', hint: 'Tag project:<nom>' },
  { id: 'runtime', label: 'runtime', hint: 'Par runtime et par fournisseur d’add-on' },
  { id: 'state', label: 'état', hint: 'Par état des applications' },
];

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

export type GroupKind = 'group' | 'rest' | 'shared' | 'orphans';

export interface HomeGroup {
  id: string;
  name: string;
  kind: GroupKind;
  apps: ApplicationSummary[];
  addons: AddonSummary[];
  /** When set, each add-on is shown under the application it is linked to rather than after every application. */
  nested?: boolean;
}

export interface GroupingContext {
  apps: readonly ApplicationSummary[];
  addons: readonly AddonSummary[];
  /** Links per application id; may be incomplete while they load. */
  links: LinksIndex;
  /** Label of an application state, for the `state` mode. */
  stateLabel: (state: ApplicationSummary['state']) => string;
}

export function buildGroups(mode: GroupMode, context: GroupingContext): HomeGroup[] {
  switch (mode) {
    case 'stack':
      return stackGroups(context);
    case 'project':
      return projectGroups(context);
    case 'runtime':
      return runtimeGroups(context);
    case 'state':
      return stateGroups(context);
    default:
      return [
        group('apps', 'Applications', 'group', context.apps, []),
        group('addons', 'Add-ons', 'group', [], context.addons),
      ];
  }
}

/** `project:<name>` or `project:<name>:<env>` → `<name>`. */
export function projectOf(tags: readonly string[]): string | null {
  return projectTag(tags)?.name ?? null;
}

/** The `project:<name>[:<env>]` tag, split. */
export function projectTag(tags: readonly string[]): { name: string; env: string | null } | null {
  for (const tag of tags) {
    const match = /^project:([^:]+)(?::([^:]+))?/i.exec(tag);
    if (match != null) {
      return { name: match[1], env: match[2] ?? null };
    }
  }
  return null;
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

export function isWeak(addon: AddonSummary): boolean {
  return WEAK_LINK_PROVIDERS.has(addon.providerId);
}

// --- stack ---------------------------------------------------------------

function stackGroups(context: GroupingContext): HomeGroup[] {
  const { apps, addons, links } = context;
  const addonById = new Map(addons.map((addon) => [addon.id, addon]));
  const appIds = new Set(apps.map((app) => app.id));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) != null && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  };
  for (const id of appIds) {
    parent.set(id, id);
  }
  const strongAddonIds = new Set<string>();
  for (const app of apps) {
    const appLinks = links[app.id];
    if (appLinks == null) {
      continue;
    }
    for (const addonId of appLinks.addonIds) {
      const addon = addonById.get(addonId);
      if (addon != null && !isWeak(addon)) {
        if (!parent.has(addonId)) {
          parent.set(addonId, addonId);
        }
        strongAddonIds.add(addonId);
        union(app.id, addonId);
      }
    }
    for (const targetId of appLinks.applicationIds) {
      if (appIds.has(targetId)) {
        union(app.id, targetId);
      }
    }
  }

  const components = new Map<string, { apps: ApplicationSummary[]; addons: AddonSummary[] }>();
  for (const app of apps) {
    const root = find(app.id);
    const component = components.get(root) ?? { apps: [], addons: [] };
    component.apps.push(app);
    components.set(root, component);
  }
  for (const addonId of strongAddonIds) {
    const component = components.get(find(addonId));
    const addon = addonById.get(addonId);
    if (component != null && addon != null) {
      component.addons.push(addon);
    }
  }

  const groups: HomeGroup[] = [];
  const rest: ApplicationSummary[] = [];
  const restAddons: AddonSummary[] = [];
  const groupOfApp = new Map<string, string>();
  for (const [root, component] of components) {
    if (component.apps.length === 1) {
      rest.push(component.apps[0]);
      restAddons.push(...component.addons);
      continue;
    }
    const id = `stack:${root}`;
    groups.push(group(id, stackName(component.apps, component.addons), 'group', component.apps, component.addons));
    for (const app of component.apps) {
      groupOfApp.set(app.id, id);
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const byId = new Map(groups.map((candidate) => [candidate.id, candidate]));
  const shared: AddonSummary[] = [];
  const orphans: AddonSummary[] = [];
  for (const addon of addons) {
    if (strongAddonIds.has(addon.id)) {
      continue;
    }
    const owners = new Set<string>();
    let linkedToRest = false;
    for (const app of apps) {
      if (links[app.id]?.addonIds.includes(addon.id)) {
        const groupId = groupOfApp.get(app.id);
        if (groupId != null) {
          owners.add(groupId);
        } else {
          linkedToRest = true;
        }
      }
    }
    if (owners.size === 1 && !linkedToRest) {
      byId.get([...owners][0])!.addons.push(addon);
    } else if (owners.size > 0 || linkedToRest) {
      shared.push(addon);
    } else {
      orphans.push(addon);
    }
  }

  return [
    ...groups,
    { ...group('rest', 'Applications', 'rest', rest, restAddons), nested: true },
    group('shared', 'Add-ons partagés', 'shared', [], shared),
    group('orphans', 'Add-ons non liés', 'orphans', [], orphans),
  ];
}

const ENV_TOKENS: ReadonlySet<string> = new Set([
  'dev',
  'prod',
  'production',
  'preprod',
  'preproduction',
  'staging',
  'stage',
  'qa',
  'qua',
  'int',
  'integration',
  'test',
  'uat',
  'recette',
  'demo',
]);

/**
 * Project tag when every application agrees (with its environment when they
 * agree on that too); otherwise the longest run of name
 * tokens they all share, ignoring environment tokens (`PROD-shop-api` and
 * `PROD-shop-web` → `shop · PROD`); otherwise the add-on binding them, or the first name.
 */
export function stackName(apps: readonly ApplicationSummary[], addons: readonly AddonSummary[] = []): string {
  const projects = apps.map((app) => projectTag(app.customerTags)).filter((project) => project != null);
  if (projects.length > 0 && projects.every((project) => project.name === projects[0].name)) {
    const env = projects.every((project) => project.env === projects[0].env) ? projects[0].env : null;
    return env == null ? projects[0].name : projects[0].name + ' · ' + env.toUpperCase();
  }
  const names = apps.map((app) => app.name).sort((a, b) => a.localeCompare(b, 'fr'));
  if (names.length === 1) {
    return names[0];
  }
  const tokenLists = names.map((name) =>
    normalise(name)
      .split(/[^a-z0-9]+/)
      .filter((token) => token !== ''),
  );
  const envs = new Set(tokenLists.map((tokens) => tokens.find((token) => ENV_TOKENS.has(token)) ?? ''));
  const common = commonRun(tokenLists.map((tokens) => tokens.filter((token) => !ENV_TOKENS.has(token))));
  const env = envs.size === 1 ? [...envs][0] : '';
  if (common.join('').length < 3) {
    // Nothing in common but the add-on that binds them: name the stack after it.
    const binder = addons[0]?.name ?? names[0];
    return env === '' || binder === names[0] ? binder : `${binder} · ${env.toUpperCase()}`;
  }
  return env === '' ? common.join('-') : `${common.join('-')} · ${env.toUpperCase()}`;
}

/** Longest contiguous run of tokens present in every list. */
function commonRun(lists: readonly (readonly string[])[]): string[] {
  const [first, ...others] = lists;
  if (first == null) {
    return [];
  }
  for (let length = first.length; length > 0; length -= 1) {
    for (let start = 0; start + length <= first.length; start += 1) {
      const candidate = first.slice(start, start + length);
      if (others.every((tokens) => containsRun(tokens, candidate))) {
        return candidate;
      }
    }
  }
  return [];
}

function containsRun(tokens: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= tokens.length; start += 1) {
    if (run.every((token, index) => tokens[start + index] === token)) {
      return true;
    }
  }
  return false;
}

// --- other modes -----------------------------------------------------------

function projectGroups(context: GroupingContext): HomeGroup[] {
  const byProject = new Map<string, HomeGroup>();
  const restApps: ApplicationSummary[] = [];
  const restAddons: AddonSummary[] = [];
  const bucket = (project: string) => {
    const key = normalise(project);
    let entry = byProject.get(key);
    if (entry == null) {
      entry = group(`project:${key}`, project, 'group', [], []);
      byProject.set(key, entry);
    }
    return entry;
  };
  for (const app of context.apps) {
    const project = projectOf(app.customerTags);
    (project == null ? restApps : bucket(project).apps).push(app);
  }
  for (const addon of context.addons) {
    const project = projectOf(addon.customerTags);
    (project == null ? restAddons : bucket(project).addons).push(addon);
  }
  const groups = [...byProject.values()]
    .map((entry) => group(entry.id, entry.name, entry.kind, entry.apps, entry.addons))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return [...groups, group('rest', 'Sans projet', 'rest', restApps, restAddons)];
}

function runtimeGroups(context: GroupingContext): HomeGroup[] {
  const apps = bucketBy(context.apps, (app) => app.variantName);
  const addons = bucketBy(context.addons, (addon) => addon.providerId);
  return [
    ...apps.map(([name, items]) => group(`runtime:${normalise(name)}`, name, 'group', items, [])),
    ...addons.map(([name, items]) => group(`provider:${normalise(name)}`, name, 'group', [], items)),
  ];
}

function stateGroups(context: GroupingContext): HomeGroup[] {
  const order: ApplicationSummary['state'][] = [
    'WANTS_TO_BE_UP',
    'SHOULD_BE_UP',
    'SHOULD_BE_DOWN',
    'MODERATED',
    'DEFAULT_OF_PAYMENT',
  ];
  const groups: HomeGroup[] = [];
  for (const state of order) {
    const apps = context.apps.filter((app) => app.state === state);
    groups.push(group(`state:${state}`, context.stateLabel(state), 'group', apps, []));
  }
  groups.push(group('addons', 'Add-ons', 'group', [], context.addons));
  return groups;
}

function bucketBy<T>(items: readonly T[], key: (item: T) => string): Array<[string, T[]]> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    buckets.set(name, [...(buckets.get(name) ?? []), item]);
  }
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
}

function group(
  id: string,
  name: string,
  kind: GroupKind,
  apps: readonly ApplicationSummary[],
  addons: readonly AddonSummary[],
): HomeGroup {
  return {
    id,
    name,
    kind,
    apps: [...apps].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    addons: [...addons].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}
