import type { AddonState } from '../../core/home/addon-state.js';
import { getLocale, t, type MessageKey } from '../../core/i18n.js';
import type { Application, Deployment, Instance } from '../../data/api.js';

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

export interface StateLabel {
  label: string;
  tone: Tone;
}

interface StateSpec {
  key: MessageKey;
  tone: Tone;
}

export const APP_STATE_LABELS: Record<Application['state'], StateSpec> = {
  SHOULD_BE_UP: { key: 'state.app.SHOULD_BE_UP', tone: 'ok' },
  WANTS_TO_BE_UP: { key: 'state.app.WANTS_TO_BE_UP', tone: 'warn' },
  SHOULD_BE_DOWN: { key: 'state.app.SHOULD_BE_DOWN', tone: 'neutral' },
  MODERATED: { key: 'state.app.MODERATED', tone: 'danger' },
  DEFAULT_OF_PAYMENT: { key: 'state.app.DEFAULT_OF_PAYMENT', tone: 'danger' },
};

export const DEPLOYMENT_STATE_LABELS: Record<Deployment['state'], StateSpec> = {
  WORK_IN_PROGRESS: { key: 'state.deployment.WORK_IN_PROGRESS', tone: 'warn' },
  TASK_IN_PROGRESS: { key: 'state.deployment.TASK_IN_PROGRESS', tone: 'warn' },
  SUCCEEDED: { key: 'state.deployment.SUCCEEDED', tone: 'ok' },
  FAILED: { key: 'state.deployment.FAILED', tone: 'danger' },
  CANCELLED: { key: 'state.deployment.CANCELLED', tone: 'neutral' },
};

const DEPLOYMENT_ACTION_KEYS: Partial<Record<Deployment['action'], MessageKey>> = {
  DEPLOY: 'deploymentAction.DEPLOY',
  UNDEPLOY: 'deploymentAction.UNDEPLOY',
  UPSCALE: 'deploymentAction.UPSCALE',
  DOWNSCALE: 'deploymentAction.DOWNSCALE',
  REPLACE: 'deploymentAction.REPLACE',
  CANCEL: 'deploymentAction.CANCEL',
};

export const INSTANCE_STATE_LABELS: Record<Instance['state'], StateSpec> = {
  UP: { key: 'state.instance.UP', tone: 'ok' },
  READY: { key: 'state.instance.READY', tone: 'ok' },
  BOOTING: { key: 'state.instance.BOOTING', tone: 'warn' },
  STARTING: { key: 'state.instance.STARTING', tone: 'warn' },
  DEPLOYING: { key: 'state.instance.DEPLOYING', tone: 'warn' },
  BUILDING: { key: 'state.instance.BUILDING', tone: 'warn' },
  TASK_IN_PROGRESS: { key: 'state.instance.TASK_IN_PROGRESS', tone: 'warn' },
  MIGRATION_IN_PROGRESS: { key: 'state.instance.MIGRATION_IN_PROGRESS', tone: 'warn' },
  STOPPING: { key: 'state.instance.STOPPING', tone: 'neutral' },
  DELETED: { key: 'state.instance.DELETED', tone: 'neutral' },
  GHOST: { key: 'state.instance.GHOST', tone: 'danger' },
};

/** An add-on state in words: the applications' words where they fit, so `state:` and grouping read both. */
export function addonStateLabel(state: AddonState): string {
  switch (state) {
    case 'up':
      return t('state.app.SHOULD_BE_UP');
    case 'starting':
      return t('state.app.WANTS_TO_BE_UP');
    case 'migrating':
      return t('addonState.migrating');
    case 'shared':
      return t('addonState.shared');
    default:
      return t('state.app.SHOULD_BE_DOWN');
  }
}

export function stateLabel<K extends string>(table: Record<K, StateSpec>, state: K | string): StateLabel {
  const spec = (table as Record<string, StateSpec>)[state];
  return spec == null ? { label: state.toLowerCase(), tone: 'neutral' } : { label: t(spec.key), tone: spec.tone };
}

/** The translated deployment action, empty for `NONE`. */
export function deploymentActionLabel(action: Deployment['action']): string {
  const key = DEPLOYMENT_ACTION_KEYS[action];
  return key == null ? '' : t(key);
}

interface Formatters {
  locale: string;
  relative: Intl.RelativeTimeFormat;
  dateTime: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  month: Intl.DateTimeFormat;
  day: Intl.DateTimeFormat;
  money: Map<string, Intl.NumberFormat>;
}

let formatters: Formatters | null = null;

function formats(): Formatters {
  const locale = getLocale();
  if (formatters == null || formatters.locale !== locale) {
    formatters = {
      locale,
      relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
      dateTime: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      month: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      day: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      money: new Map(),
    };
  }
  return formatters;
}

/** "3 minutes ago", "yesterday", "in 2 hours". Accepts ISO strings or unix timestamps in ms or s. */
export function formatRelative(value: string | number | null | undefined, now = Date.now()): string {
  const date = toDate(value);
  if (date == null) {
    return '';
  }
  const { relative } = formats();
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) {
    return relative.format(diffSeconds, 'second');
  }
  if (abs < 3600) {
    return relative.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (abs < 86_400) {
    return relative.format(Math.round(diffSeconds / 3600), 'hour');
  }
  if (abs < 86_400 * 30) {
    return relative.format(Math.round(diffSeconds / 86_400), 'day');
  }
  if (abs < 86_400 * 365) {
    return relative.format(Math.round(diffSeconds / (86_400 * 30)), 'month');
  }
  return relative.format(Math.round(diffSeconds / (86_400 * 365)), 'year');
}

export function formatDateTime(value: string | number | null | undefined): string {
  const date = toDate(value);
  return date == null ? '' : formats().dateTime.format(date);
}

export function formatTime(value: string | number | null | undefined): string {
  const date = toDate(value);
  return date == null ? '' : formats().time.format(date);
}

/** "September 2026", in UTC so a period starting at midnight UTC names the right month. */
export function formatMonth(value: string | number | null | undefined): string {
  const date = toDate(value);
  return date == null ? '' : formats().month.format(date);
}

/** "18 Oct", in UTC like the days of the billing system. */
export function formatDay(value: string | number | null | undefined): string {
  const date = toDate(value);
  return date == null ? '' : formats().day.format(date);
}

/** "1 234 €" above ten, "7.41 €" below, "0 €" for nothing: a column of costs stays readable while small add-ons keep their cents. */
export function formatMoney(amount: number, currency: string): string {
  const { locale, money } = formats();
  const digits = amount !== 0 && Math.abs(amount) < 10 ? 2 : 0;
  const key = `${currency}/${digits}`;
  let format = money.get(key);
  if (format == null) {
    try {
      format = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    } catch {
      format = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    money.set(key, format);
  }
  return format.format(amount);
}

export function shortCommit(commitId: string | null | undefined): string {
  return commitId == null ? '' : commitId.slice(0, 8);
}

export function shortId(id: string, keep = 8): string {
  const index = id.indexOf('_');
  return index === -1 ? id.slice(0, keep) : `${id.slice(0, index + 1)}${id.slice(index + 1, index + 1 + keep)}`;
}

/** "13 to 18", or "8.10.2" when Clever Cloud offers a single version; the list sorted oldest first. */
export function formatVersionRange(offered: readonly string[]): string {
  const from = offered[0] ?? '';
  const to = offered.at(-1) ?? '';
  return from === to ? from : t('database.versionRange', { from, to });
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
