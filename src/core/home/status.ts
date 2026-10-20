/**
 * The status of an application the way the Clever Cloud Console shows it:
 * its state combined with its last deployment, so a running application whose
 * redeployment failed does not look like any other running one.
 */
import type { ApplicationSummary, Deployment } from '../../data/api.js';
import { isInProgress } from './activity.js';

export type AppStatus =
  /** Up, nothing going on. */
  | 'running'
  /** Up, a deployment is in progress. */
  | 'restarting'
  /** Up, the last deployment failed: the previous version keeps running. */
  | 'restart-failed'
  /** Down and on its way up. */
  | 'starting'
  /** Down, the last deployment failed. */
  | 'start-failed'
  | 'stopped'
  /** Stopped by Clever Cloud: moderation or payment default. */
  | 'blocked';

/** `last` is the most recent deployment of the application, platform ones included; null while unknown. */
export function appStatus(state: ApplicationSummary['state'], last: Deployment | null): AppStatus {
  const deploying = last != null && isInProgress(last);
  const failed = last != null && last.state === 'FAILED';
  switch (state) {
    case 'MODERATED':
    case 'DEFAULT_OF_PAYMENT':
      return 'blocked';
    case 'SHOULD_BE_UP':
      return deploying ? 'restarting' : failed ? 'restart-failed' : 'running';
    case 'WANTS_TO_BE_UP':
      return failed && !deploying ? 'start-failed' : 'starting';
    default:
      return deploying ? 'starting' : failed ? 'start-failed' : 'stopped';
  }
}
