/**
 * Bulk restart or stop of the selected applications. The plan says which
 * applications are concerned and which are left out: add-ons always, and for
 * a stop the applications already stopped. Each step is one `clever` command
 * and one API call, run with the same small concurrency as the tags.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { redeployApplication, undeployApplication, type ApplicationSummary } from '../../data/api.js';
import type { StepExecutor } from './tagging.js';

export type BulkKind = 'restart' | 'stop';

export interface BulkApp {
  id: string;
  name: string;
  state: ApplicationSummary['state'];
}

export interface BulkStep {
  kind: BulkKind;
  app: BulkApp;
}

export interface BulkPlan {
  steps: BulkStep[];
  /** Applications left out of a stop because they are stopped already. */
  alreadyStopped: BulkApp[];
}

/** A restart also starts a stopped application; a stop skips one already stopped. */
export function planBulk(kind: BulkKind, apps: readonly BulkApp[]): BulkPlan {
  const stopped = (app: BulkApp) => app.state === 'SHOULD_BE_DOWN';
  const alreadyStopped = kind === 'stop' ? apps.filter(stopped) : [];
  const concerned = kind === 'stop' ? apps.filter((app) => !stopped(app)) : [...apps];
  return { steps: concerned.map((app) => ({ kind, app })), alreadyStopped };
}

export function describeBulkStep(step: BulkStep): string {
  return `clever ${step.kind} --app ${step.app.id}`;
}

export function bulkExecutor(client: CcApiClient, ownerId: string): StepExecutor<BulkStep> {
  return async (step) => {
    if (step.kind === 'restart') {
      await redeployApplication(client, ownerId, step.app.id);
    } else {
      await undeployApplication(client, ownerId, step.app.id);
    }
  };
}
