/**
 * The state of an add-on, which the API does not give: derived from its
 * instances. Only dedicated plans have some; an add-on without any is on a
 * shared plan (a database cluster, Cellar, a config provider…).
 */
import type { AddonInstance } from '../../data/api.js';
import type { AppStatus } from './status.js';

export type AddonState = 'up' | 'starting' | 'migrating' | 'stopping' | 'down' | 'shared';

const STARTING: ReadonlySet<AddonInstance['state']> = new Set(['BOOTING', 'STARTING', 'DEPLOYING', 'TASK_IN_PROGRESS']);
const UP: ReadonlySet<AddonInstance['state']> = new Set(['UP', 'READY']);

/** The most telling state of the live instances: a migration (plan change) or a start before "up". */
export function addonState(instances: ReadonlyArray<Pick<AddonInstance, 'state'>>): AddonState {
  const live = instances.filter((instance) => instance.state !== 'DELETED');
  if (live.length === 0) {
    return 'shared';
  }
  const states = new Set(live.map((instance) => instance.state));
  if (states.has('MIGRATION_IN_PROGRESS')) {
    return 'migrating';
  }
  if ([...states].some((state) => STARTING.has(state))) {
    return 'starting';
  }
  if ([...states].some((state) => UP.has(state))) {
    return 'up';
  }
  return states.has('STOPPING') ? 'stopping' : 'down';
}

/** The icon an add-on state shares with the applications; a shared add-on has none. */
export const ADDON_STATE_STATUS: Record<AddonState, AppStatus | null> = {
  up: 'running',
  starting: 'starting',
  migrating: 'restarting',
  stopping: 'stopped',
  down: 'stopped',
  shared: null,
};

/** Order of a sort by state, as for applications: up first, shared last. */
export const ADDON_STATE_RANK: Record<AddonState, number> = {
  up: 0,
  migrating: 1,
  starting: 1,
  stopping: 2,
  down: 2,
  shared: 4,
};
