/**
 * What the organisation-wide deployment list says about each application:
 * the latest deployment, the latest one a human triggered, and what deserves
 * attention right now. Platform-triggered deployments (image updates,
 * monitoring restarts) carry no author; they are kept but shown dimmed, so
 * "recent activity" means yours, not Clever Cloud's maintenance.
 */
import type { ApplicationSummary, Deployment } from '../../data/api.js';
import { t } from '../i18n.js';

export interface AppActivity {
  /** Most recent deployment, whoever triggered it. */
  last: Deployment;
  /** Most recent deployment triggered by a user, when there is one. */
  lastHuman: Deployment | null;
}

export type WatchKind = 'failed' | 'deploying' | 'moderated' | 'payment';

export interface WatchItem {
  kind: WatchKind;
  app: ApplicationSummary;
  deployment: Deployment | null;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function isHumanDeployment(deployment: Deployment): boolean {
  const id = deployment.author?.id;
  return id != null && id !== '';
}

export function isInProgress(deployment: Deployment): boolean {
  return deployment.state === 'WORK_IN_PROGRESS' || deployment.state === 'TASK_IN_PROGRESS';
}

/** Human-readable origin of a deployment: who, or which platform process. */
export function describeOrigin(deployment: Deployment, currentUserId = ''): string {
  if (isHumanDeployment(deployment)) {
    if (deployment.author.id === currentUserId) {
      return t('origin.you');
    }
    return deployment.author.name ?? t('origin.member');
  }
  const cause = deployment.cause ?? '';
  if (cause.startsWith('Maintenance')) {
    return t('origin.maintenance');
  }
  if (cause.startsWith('Monitoring')) {
    return t('origin.monitoring');
  }
  return cause === '' ? t('origin.platform') : cause;
}

/** Indexes deployments by application, newest first. The API groups them by application without a global order. */
export function indexActivity(deployments: readonly Deployment[]): Map<string, AppActivity> {
  const sorted = [...deployments].sort((a, b) => b.date.localeCompare(a.date));
  const index = new Map<string, AppActivity>();
  for (const deployment of sorted) {
    const entry = index.get(deployment.applicationId);
    if (entry == null) {
      index.set(deployment.applicationId, {
        last: deployment,
        lastHuman: isHumanDeployment(deployment) ? deployment : null,
      });
    } else if (entry.lastHuman == null && isHumanDeployment(deployment)) {
      entry.lastHuman = deployment;
    }
  }
  return index;
}

/**
 * Applications that need a look: deployments in progress, a failed last deployment
 * on an application meant to run (or any failure in the last week), applications
 * asked to start less than an hour ago, moderated applications and payment
 * defaults. Failures first.
 */
export function watchList(
  apps: readonly ApplicationSummary[],
  activity: ReadonlyMap<string, AppActivity>,
  now = Date.now(),
): WatchItem[] {
  const items: WatchItem[] = [];
  for (const app of apps) {
    if (app.isArchived) {
      continue;
    }
    const last = activity.get(app.id)?.last ?? null;
    if (app.state === 'MODERATED') {
      items.push({ kind: 'moderated', app, deployment: last });
    } else if (app.state === 'DEFAULT_OF_PAYMENT') {
      items.push({ kind: 'payment', app, deployment: last });
    } else if (last != null && isInProgress(last)) {
      items.push({ kind: 'deploying', app, deployment: last });
    } else if (last != null && last.state === 'FAILED') {
      const recent = now - Date.parse(last.date) < 7 * DAY;
      if (app.state === 'SHOULD_BE_UP' || recent) {
        items.push({ kind: 'failed', app, deployment: last });
      }
    } else if (app.state === 'WANTS_TO_BE_UP' && last != null && now - Date.parse(last.date) < HOUR) {
      // An application stuck in WANTS_TO_BE_UP for months (the Kibana instance of an Elasticsearch
      // add-on, for instance) is not starting; only a fresh deployment makes it so.
      items.push({ kind: 'deploying', app, deployment: last });
    }
  }
  const rank: Record<WatchKind, number> = { failed: 0, deploying: 1, moderated: 2, payment: 3 };
  return items.sort((a, b) => {
    if (rank[a.kind] !== rank[b.kind]) {
      return rank[a.kind] - rank[b.kind];
    }
    return (b.deployment?.date ?? '').localeCompare(a.deployment?.date ?? '');
  });
}
