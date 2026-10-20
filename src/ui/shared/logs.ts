/**
 * What the log views share: the replay windows, the status of a stream in
 * words, and the look of a runtime line, so the application tab and the
 * multi-application page read the same.
 */
import { css, html } from 'lit';
import type { StreamStatus } from '../../core/logs/stream.js';
import { t, type MessageKey } from '../../core/i18n.js';
import type { ApplicationRuntimeLog } from '../../data/api.js';
import { formatTime } from './format.js';

export const SINCE_OPTIONS: ReadonlyArray<{ value: string; label: MessageKey; minutes: number }> = [
  { value: 'now', label: 'logs.since.now', minutes: 0 },
  { value: '15m', label: 'logs.since.15m', minutes: 15 },
  { value: '1h', label: 'logs.since.1h', minutes: 60 },
  { value: '6h', label: 'logs.since.6h', minutes: 360 },
  { value: '24h', label: 'logs.since.24h', minutes: 1440 },
];

export function sinceMinutes(value: string): number {
  return SINCE_OPTIONS.find((option) => option.value === value)?.minutes ?? 0;
}

/** The `--since` flag of a replay window, empty for "now". */
export function sinceFlag(value: string): string {
  return value === 'now' ? '' : ` --since ${value}`;
}

export function streamStatusLabel(status: StreamStatus): { label: string; tone: string } {
  switch (status) {
    case 'connecting':
      return { label: t('logs.status.connecting'), tone: 'warn' };
    case 'open':
      return { label: t('logs.status.open'), tone: 'ok' };
    case 'paused':
      return { label: t('logs.status.paused'), tone: 'warn' };
    case 'closed':
      return { label: t('logs.status.closed'), tone: 'neutral' };
    case 'error':
      return { label: t('logs.status.error'), tone: 'danger' };
    default:
      return { label: '', tone: 'neutral' };
  }
}

/** The error of a stream, with the reconnections the client made. */
export function streamError(error: string | null, retries: number): string | null {
  if (error == null) {
    return null;
  }
  return retries > 0 ? `${error} (${t('logs.retry', { count: retries })})` : error;
}

export function runtimeSearchText(log: ApplicationRuntimeLog): string {
  return `${log.service} ${log.message}`.toLowerCase();
}

/** Time, service and message, coloured by severity. */
export function renderRuntimeLine(log: ApplicationRuntimeLog) {
  return html`<div class="line sev-${log.severity}">
    <time datetime=${log.date} title=${log.date}>${formatTime(log.date)}</time>
    <span class="service" title=${log.instanceId}>${log.service}</span>
    <span class="message">${log.message}</span>
  </div>`;
}

export const logStyles = css`
  .lines {
    overflow: auto;
    padding: 0.5rem 0.75rem;
    font-family: var(--cvc-mono);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .line {
    display: grid;
    grid-template-columns: 8ch 12ch 1fr;
    gap: 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .line time,
  .line .service {
    color: var(--cvc-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line.sev-err .message,
  .line.sev-crit .message,
  .line.sev-alert .message,
  .line.sev-emerg .message {
    color: var(--cvc-danger);
  }
  .line.sev-warning .message {
    color: var(--cvc-warn);
  }
  .seg {
    display: inline-flex;
    gap: 0.15rem;
  }
  .seg button {
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    font-size: 0.85rem;
    background: transparent;
  }
  .seg button.on {
    background: var(--cvc-text);
    color: var(--cvc-bg);
    border-color: transparent;
  }
`;
