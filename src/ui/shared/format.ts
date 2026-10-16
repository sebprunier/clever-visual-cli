import type { Application, Deployment, Instance } from '../../data/api.js';

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

export interface StateLabel {
  label: string;
  tone: Tone;
}

export const APP_STATE_LABELS: Record<Application['state'], StateLabel> = {
  SHOULD_BE_UP: { label: 'démarrée', tone: 'ok' },
  WANTS_TO_BE_UP: { label: 'démarrage', tone: 'warn' },
  SHOULD_BE_DOWN: { label: 'arrêtée', tone: 'neutral' },
  MODERATED: { label: 'modérée', tone: 'danger' },
  DEFAULT_OF_PAYMENT: { label: 'défaut de paiement', tone: 'danger' },
};

export const DEPLOYMENT_STATE_LABELS: Record<Deployment['state'], StateLabel> = {
  WORK_IN_PROGRESS: { label: 'en cours', tone: 'warn' },
  TASK_IN_PROGRESS: { label: 'tâche en cours', tone: 'warn' },
  SUCCEEDED: { label: 'réussi', tone: 'ok' },
  FAILED: { label: 'échoué', tone: 'danger' },
  CANCELLED: { label: 'annulé', tone: 'neutral' },
};

export const DEPLOYMENT_ACTION_LABELS: Record<Deployment['action'], string> = {
  DEPLOY: 'déploiement',
  UNDEPLOY: 'arrêt',
  UPSCALE: 'montée en charge',
  DOWNSCALE: 'réduction',
  REPLACE: 'remplacement',
  CANCEL: 'annulation',
  NONE: '',
};

export const INSTANCE_STATE_LABELS: Record<Instance['state'], StateLabel> = {
  UP: { label: 'up', tone: 'ok' },
  READY: { label: 'prête', tone: 'ok' },
  BOOTING: { label: 'démarrage', tone: 'warn' },
  STARTING: { label: 'démarrage', tone: 'warn' },
  DEPLOYING: { label: 'déploiement', tone: 'warn' },
  BUILDING: { label: 'build', tone: 'warn' },
  TASK_IN_PROGRESS: { label: 'tâche', tone: 'warn' },
  MIGRATION_IN_PROGRESS: { label: 'migration', tone: 'warn' },
  STOPPING: { label: 'arrêt', tone: 'neutral' },
  DELETED: { label: 'supprimée', tone: 'neutral' },
  GHOST: { label: 'fantôme', tone: 'danger' },
};

export function stateLabel<K extends string>(table: Record<K, StateLabel>, state: K | string): StateLabel {
  return (table as Record<string, StateLabel>)[state] ?? { label: state.toLowerCase(), tone: 'neutral' };
}

const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** "il y a 3 minutes", "hier", "dans 2 heures". Accepts ISO strings or unix timestamps in ms or s. */
export function formatRelative(value: string | number | null | undefined, now = Date.now()): string {
  const date = toDate(value);
  if (date == null) {
    return '';
  }
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) {
    return relativeFormat.format(diffSeconds, 'second');
  }
  if (abs < 3600) {
    return relativeFormat.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (abs < 86_400) {
    return relativeFormat.format(Math.round(diffSeconds / 3600), 'hour');
  }
  if (abs < 86_400 * 30) {
    return relativeFormat.format(Math.round(diffSeconds / 86_400), 'day');
  }
  if (abs < 86_400 * 365) {
    return relativeFormat.format(Math.round(diffSeconds / (86_400 * 30)), 'month');
  }
  return relativeFormat.format(Math.round(diffSeconds / (86_400 * 365)), 'year');
}

export function formatDateTime(value: string | number | null | undefined): string {
  const date = toDate(value);
  return date == null ? '' : dateTimeFormat.format(date);
}

export function formatTime(value: string | number | null | undefined): string {
  const date = toDate(value);
  return date == null ? '' : timeFormat.format(date);
}

export function shortCommit(commitId: string | null | undefined): string {
  return commitId == null ? '' : commitId.slice(0, 8);
}

export function shortId(id: string, keep = 8): string {
  const index = id.indexOf('_');
  return index === -1 ? id.slice(0, keep) : `${id.slice(0, index + 1)}${id.slice(index + 1, index + 1 + keep)}`;
}

function toDate(value: string | number | null | undefined): Date | null {
  // The API reports "never" as 0 for timestamps.
  if (value == null || value === '' || value === 0) {
    return null;
  }
  // Unix timestamps in seconds fit in 10 digits; the API mixes seconds and milliseconds.
  const date = typeof value === 'number' ? new Date(value < 1e11 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
