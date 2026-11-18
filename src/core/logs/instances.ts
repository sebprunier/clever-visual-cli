/**
 * The instances behind the lines of the Logs tab (#38): the ones alive in the window, grouped by
 * the deployment that created them, how many lines each wrote, a colour each, and the selection
 * that keeps their lines only. As in the Console, nothing selected means every line.
 */
import type { Deployment, Instance } from '../../data/api.js';
import { GOLDEN_ANGLE, hueOf } from './merge.js';

/** An instance as the panel shows it: read from the API, or only known from its lines. */
export interface LogInstance {
  id: string;
  /** The deployment that created it; empty when only access lines name it. */
  deploymentId: string;
  name: string | null;
  index: number | null;
  flavor: string | null;
  /** Null when the API does not know it (a 404): its lines are all there is. */
  state: Instance['state'] | null;
  createdAt: string | null;
  deletedAt: string | null;
  isBuildVm: boolean;
}

export function fromApi(instance: Instance): LogInstance {
  return {
    id: instance.id,
    deploymentId: instance.deploymentId,
    name: instance.name ?? null,
    index: instance.index ?? null,
    flavor: instance.flavor ?? null,
    state: instance.state,
    createdAt: instance.createdAt,
    deletedAt: instance.deletedAt ?? null,
    isBuildVm: instance.isBuildVm,
  };
}

/** An instance the API does not know, named by its lines; a runtime line gives its deployment too. */
export function unknownInstance(id: string, deploymentId = ''): LogInstance {
  return {
    id,
    deploymentId,
    name: null,
    index: null,
    flavor: null,
    state: null,
    createdAt: null,
    deletedAt: null,
    isBuildVm: false,
  };
}

export interface InstanceGroup {
  /** Empty for the instances of no known deployment. */
  deploymentId: string;
  deployment: Deployment | null;
  instances: LogInstance[];
}

/**
 * The instances by deployment, the newest deployment first (its date, else the creation of its
 * first instance), the instances of no deployment last. In a deployment, the build instance comes
 * first, then the others by number.
 */
export function groupInstances(
  instances: Iterable<LogInstance>,
  deployments: ReadonlyMap<string, Deployment>,
): InstanceGroup[] {
  const groups = new Map<string, InstanceGroup>();
  for (const instance of instances) {
    let group = groups.get(instance.deploymentId);
    if (group == null) {
      group = {
        deploymentId: instance.deploymentId,
        deployment: deployments.get(instance.deploymentId) ?? null,
        instances: [],
      };
      groups.set(instance.deploymentId, group);
    }
    group.instances.push(instance);
  }
  for (const group of groups.values()) {
    group.instances.sort(compareInstances);
  }
  return [...groups.values()].sort((a, b) => {
    if ((a.deploymentId === '') !== (b.deploymentId === '')) {
      return a.deploymentId === '' ? 1 : -1;
    }
    return groupDate(b).localeCompare(groupDate(a)) || a.deploymentId.localeCompare(b.deploymentId);
  });
}

function groupDate(group: InstanceGroup): string {
  if (group.deployment != null) {
    return group.deployment.date;
  }
  const dates = group.instances.map((instance) => instance.createdAt).filter((date): date is string => date != null);
  return dates.sort()[0] ?? '';
}

function compareInstances(a: LogInstance, b: LogInstance): number {
  if (a.isBuildVm !== b.isBuildVm) {
    return a.isBuildVm ? -1 : 1;
  }
  return (
    (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER) ||
    (a.createdAt ?? '').localeCompare(b.createdAt ?? '') ||
    a.id.localeCompare(b.id)
  );
}

/** How many lines each instance wrote, among the lines given. */
export function countLines(lines: Iterable<{ instanceId?: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (line.instanceId != null && line.instanceId !== '') {
      counts.set(line.instanceId, (counts.get(line.instanceId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The ids of `ids` not known yet, in their order: those that wrote lines (their counts), or
 * those of a wider window the panel does not show.
 */
export function unlisted(ids: ReadonlyMap<string, unknown>, known: ReadonlyMap<string, unknown>): string[] {
  return [...ids.keys()].filter((id) => !known.has(id));
}

/**
 * A colour per instance that never changes while the view lives: the hues taken keep their
 * instances, a new instance takes the next step of the golden angle, from a start derived from
 * `seed` (the application). Give the ids oldest first, so the first instances get the most
 * distinct colours.
 */
export function assignHues(
  previous: ReadonlyMap<string, number>,
  ids: Iterable<string>,
  seed: string,
): Map<string, number> {
  const hues = new Map(previous);
  const start = hueOf(seed);
  for (const id of ids) {
    if (!hues.has(id)) {
      hues.set(id, Math.round((start + hues.size * GOLDEN_ANGLE) % 360));
    }
  }
  return hues;
}

/** The instances oldest first, those the API does not know after: the order colours are given in. */
export function byCreation(instances: Iterable<LogInstance>): string[] {
  return [...instances]
    .sort((a, b) => {
      if ((a.createdAt == null) !== (b.createdAt == null)) {
        return a.createdAt == null ? 1 : -1;
      }
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || compareInstances(a, b);
    })
    .map((instance) => instance.id);
}

/** The selection written in the address, `?instances=<id>,<id>`. */
export function parseSelection(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  );
}

/** The value of `?instances=`, or null to remove it when nothing is selected. */
export function selectionParam(selection: ReadonlySet<string>): string | null {
  return selection.size === 0 ? null : [...selection].sort().join(',');
}

/** The selection without the ids no longer in the window; the same set when nothing goes. */
export function keepAvailable(
  selection: ReadonlySet<string>,
  available: ReadonlyMap<string, unknown>,
): ReadonlySet<string> {
  const kept = [...selection].filter((id) => available.has(id));
  return kept.length === selection.size ? selection : new Set(kept);
}

/** Whether a line is shown for the selection: every line when nothing is selected. */
export function inSelection(selection: ReadonlySet<string>, line: { instanceId?: string }): boolean {
  return selection.size === 0 || (line.instanceId != null && selection.has(line.instanceId));
}

/**
 * The clever-tools command that lists the same instances: those of one deployment, those that
 * existed since the start of the window (`--since 15m`), or the running ones for "now".
 */
export function instancesCommand(appId: string, window: { since?: string; deploymentId?: string }): string {
  if (window.deploymentId != null && window.deploymentId !== '') {
    return `clever instances --app ${appId} --deployment-id ${window.deploymentId}`;
  }
  return window.since == null || window.since === 'now'
    ? `clever instances --app ${appId}`
    : `clever instances --app ${appId} --since ${window.since}`;
}
