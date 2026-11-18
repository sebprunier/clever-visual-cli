/**
 * What the log views share: the replay windows, the status of a stream in
 * words, and the look of a runtime line, so the application tab and the
 * multi-application page read the same.
 */
import { css, html, nothing, unsafeCSS } from 'lit';
import { ANSI_COLOURS, hasAnsi, parseAnsi, stripAnsi, type AnsiSegment } from '../../core/logs/ansi.js';
import type { StreamStatus } from '../../core/logs/stream.js';
import { t, type MessageKey } from '../../core/i18n.js';
import type { ApplicationRuntimeLog } from '../../data/api.js';
import { formatTime } from './format.js';
import { inlineStyle } from './inline-style.js';

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

/** What a runtime line needs, from an application or from an add-on. */
export type RuntimeLine = Pick<
  ApplicationRuntimeLog,
  'id' | 'date' | 'severity' | 'service' | 'message' | 'instanceId'
>;

/** What the filter reads: the service and the message, without its escape codes. */
export function runtimeSearchText(log: RuntimeLine): string {
  return `${log.service} ${stripAnsi(log.message)}`.toLowerCase();
}

/** Parsed once per line: a view renders all its lines again whenever new ones arrive. */
const segmentsOf = new WeakMap<object, AnsiSegment[]>();

/**
 * The message of a line, its ANSI colours and styles as classes (never a `style` attribute: the
 * production CSP refuses it). A message without escape codes is plain text.
 */
export function renderMessage(line: { message: string }) {
  if (!hasAnsi(line.message)) {
    return line.message;
  }
  let segments = segmentsOf.get(line);
  if (segments == null) {
    segments = parseAnsi(line.message);
    segmentsOf.set(line, segments);
  }
  return segments.map((segment) => {
    const classes = ansiClasses(segment);
    return classes === '' ? segment.text : html`<span class=${classes}>${segment.text}</span>`;
  });
}

function ansiClasses(segment: AnsiSegment): string {
  return [
    segment.fg == null ? '' : `ansi-${segment.fg}`,
    segment.bg == null ? '' : `ansi-bg-${segment.bg}`,
    segment.bold ? 'ansi-bold' : '',
    segment.dim ? 'ansi-dim' : '',
    segment.italic ? 'ansi-italic' : '',
    segment.underline ? 'ansi-underline' : '',
  ]
    .filter((name) => name !== '')
    .join(' ');
}

/** One class per ANSI colour, foreground and background, on the theme's `--cvc-ansi-*` tokens. */
const ansiColourStyles = unsafeCSS(
  ANSI_COLOURS.map(
    (colour) =>
      `.ansi-${colour} { color: var(--cvc-ansi-${colour}); }\n` +
      `.ansi-bg-${colour} { background: color-mix(in srgb, var(--cvc-ansi-${colour}) 25%, transparent); }`,
  ).join('\n'),
);

export interface RuntimeLineOptions {
  /** After the time: the source of the line in a merged view. */
  lead?: unknown;
  /** Behind the line. */
  tint?: string | null;
  /** The message in the colour of its severity; true by default. */
  severity?: boolean;
  /** A bar on the left in this colour: the instance that wrote the line (#38). */
  mark?: string | null;
  /** The tooltip of the service: the instance that wrote the line, in words; its id by default. */
  source?: string;
}

/** Time, service and message, with what `options` adds. */
export function renderRuntimeLine(log: RuntimeLine, options: RuntimeLineOptions = {}) {
  const { lead = nothing, tint = null, severity = true, mark = null, source = log.instanceId } = options;
  return html`<div
    class="line ${severity ? `sev-${log.severity}` : ''} ${mark == null ? '' : 'marked'}"
    ${inlineStyle({ background: tint, '--cvc-mark': mark })}
  >
    <time datetime=${log.date} title=${log.date}>${formatTime(log.date)}</time>
    ${lead}
    <span class="service" title=${source}>${log.service}</span>
    <span class="message">${renderMessage(log)}</span>
  </div>`;
}

export const logStyles = [
  ansiColourStyles,
  css`
    /* The buttons with a label, as small as the window and the filter beside them. */
    .toolbar button.ghost:not(.icon-only) {
      padding: 0.3rem 0.55rem;
      font-size: 0.85em;
    }
    /* The filter of the lines: as small as the controls beside it, growing up to a readable width. */
    .toolbar input[type='search'] {
      flex: 1 1 14rem;
      width: auto;
      min-width: 10rem;
      max-width: 26rem;
      font-size: 0.85em;
    }
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
    /* The instance that wrote the line, when several write in the view (#38). */
    .line.marked {
      box-shadow: inset 3px 0 0 var(--cvc-mark);
      padding-left: 0.6rem;
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
    .ansi-bold {
      font-weight: 600;
    }
    .ansi-dim {
      opacity: 0.7;
    }
    .ansi-italic {
      font-style: italic;
    }
    .ansi-underline {
      text-decoration: underline;
    }
  `,
];
