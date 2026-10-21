/**
 * The logs of one deployment (#13): why it failed, or a restart followed as
 * it happens, as `clever restart` does. The Logs tab of an application reads
 * `?deployment=`; the logs of several applications read
 * `?deployments=<app>:<deployment>,…&from=<date>` after a restart of the
 * selection. Only application logs: access logs have no deployment filter.
 */
import { routeToHash, withHashParams } from '../router.js';

/** The stream starts a minute before the deployment, so nothing of its beginning is missed. */
const MARGIN_MS = 60_000;

export interface Restart {
  appId: string;
  deploymentId: string;
}

/** Where the lines of a deployment start. */
export function deploymentSince(date: string): Date {
  return new Date(Date.parse(date) - MARGIN_MS);
}

/** `2026-10-17T15:30:35Z`: what `clever logs --since` reads, without the milliseconds. */
export function isoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** `--since` is needed: without it, clever-tools streams from now on. */
export function deploymentLogsCommand(appId: string, deploymentId: string, since: Date): string {
  return `clever logs --app ${appId} --deployment-id ${deploymentId} --since ${isoSeconds(since)}`;
}

/** The Logs tab of an application on one of its deployments, the list of the home page kept when given. */
export function deploymentLogsHash(
  ownerId: string,
  appId: string,
  deploymentId: string,
  view?: { filter: string | null; grouping: string | null },
): string {
  return withHashParams(routeToHash({ kind: 'app', ownerId, appId, tab: 'logs' }), {
    deployment: deploymentId,
    q: view?.filter?.trim() ?? null,
    g: view?.grouping?.trim() ?? null,
  });
}

/** The logs of the applications just restarted together, each on its new deployment. */
export function restartsLogsHash(ownerId: string, restarts: readonly Restart[], from: Date): string {
  return withHashParams(routeToHash({ kind: 'logs', ownerId }), {
    apps: restarts.map((restart) => restart.appId).join(','),
    deployments: restarts.map((restart) => `${restart.appId}:${restart.deploymentId}`).join(','),
    from: isoSeconds(from),
  });
}

/** `?deployments=` as application → deployment; pairs that do not hold together are left out. */
export function parseRestarts(value: string | null): Map<string, string> {
  const restarts = new Map<string, string>();
  for (const pair of (value ?? '').split(',')) {
    const [appId, deploymentId] = pair.split(':');
    if (appId?.startsWith('app_') && deploymentId?.startsWith('deployment_')) {
      restarts.set(appId, deploymentId);
    }
  }
  return restarts;
}

/** `?from=` as a date, null when absent or unreadable. */
export function parseFrom(value: string | null): Date | null {
  const time = value == null ? Number.NaN : Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}
