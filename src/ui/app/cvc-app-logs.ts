import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { t, type MessageKey } from '../../core/i18n.js';
import { CvcElement } from '../shared/cvc-element.js';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import {
  openAccessLogs,
  openRuntimeLogs,
  type ApplicationAccessLog,
  type ApplicationRuntimeLog,
  type LogsStream,
} from '../../data/api.js';
import { formatTime } from '../shared/format.js';
import '../shared/cvc-cli.js';
import { sharedStyles } from '../shared/styles.js';

type StreamStatus = 'idle' | 'connecting' | 'open' | 'paused' | 'closed' | 'error';
/** What the application writes, or the HTTP requests it answered. */
type LogMode = 'app' | 'access';
type LogLine = ApplicationRuntimeLog | ApplicationAccessLog;

const MODE_KEY = 'cvc.logs.mode';
const MODES: Array<{ value: LogMode; label: MessageKey; command: string }> = [
  { value: 'app', label: 'logs.mode.app', command: 'clever logs' },
  { value: 'access', label: 'logs.mode.access', command: 'clever accesslogs' },
];

const MAX_LINES = 2000;
const SINCE_OPTIONS: Array<{ value: string; label: MessageKey; minutes: number }> = [
  { value: 'now', label: 'logs.since.now', minutes: 0 },
  { value: '15m', label: 'logs.since.15m', minutes: 15 },
  { value: '1h', label: 'logs.since.1h', minutes: 60 },
  { value: '6h', label: 'logs.since.6h', minutes: 360 },
  { value: '24h', label: 'logs.since.24h', minutes: 1440 },
];

/**
 * Live logs with pause, filter and replay window: what the application writes
 * (`clever logs`) or, one switch away, the HTTP requests it answered
 * (`clever accesslogs`). The chosen kind is remembered in this browser.
 */
@customElement('cvc-app-logs')
export class CvcAppLogs extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';

  @state() private mode: LogMode = readMode();
  @state() private status: StreamStatus = 'idle';
  @state() private error: string | null = null;
  @state() private since = '15m';
  @state() private filter = '';
  @state() private autoscroll = true;
  @state() private lines: LogLine[] = [];

  @query('.lines') private container?: HTMLElement;

  private stream: LogsStream<LogLine> | null = null;
  private pending: LogLine[] = [];
  private flushScheduled = false;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId')) {
      this.lines = [];
      void this.start();
    }
  }

  override updated(): void {
    if (this.autoscroll && this.container != null) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  override disconnectedCallback(): void {
    this.stop();
    super.disconnectedCallback();
  }

  private async start(): Promise<void> {
    if (this.client == null || this.appId === '') {
      return;
    }
    this.stop();
    const { client, ownerId, appId, mode } = this;
    const minutes = SINCE_OPTIONS.find((option) => option.value === this.since)?.minutes ?? 0;
    const since = minutes > 0 ? new Date(Date.now() - minutes * 60_000) : new Date();
    this.status = 'connecting';
    this.error = null;
    try {
      const stream: LogsStream<LogLine> =
        mode === 'app'
          ? await openRuntimeLogs(client, ownerId, appId, { since })
          : await openAccessLogs(client, ownerId, appId, { since });
      if (this.appId !== appId || this.mode !== mode) {
        stream.close();
        return;
      }
      stream
        .onOpen(() => {
          this.status = 'open';
        })
        .onLog((log) => this.enqueue(log))
        .onError((error) => {
          this.error = `${error.message}${stream.retryCount > 0 ? ` (reconnexion n°${stream.retryCount})` : ''}`;
        });
      this.stream = stream;
      void stream.start().then(() => {
        if (this.stream === stream) {
          this.stream = null;
          this.status = 'closed';
        }
      });
    } catch (error) {
      this.status = 'error';
      this.error = describeError(error);
    }
  }

  private stop(): void {
    if (this.stream != null) {
      this.stream.close();
      this.stream = null;
      this.status = 'closed';
    }
  }

  private togglePause(): void {
    if (this.stream == null) {
      return;
    }
    if (this.status === 'paused') {
      this.stream.resume();
      this.status = 'open';
    } else {
      this.stream.pause();
      this.status = 'paused';
    }
  }

  private setMode(mode: LogMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Not essential.
    }
    this.lines = [];
    this.pending = [];
    void this.start();
  }

  private enqueue(log: LogLine): void {
    this.pending.push(log);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    this.flushScheduled = false;
    if (this.pending.length === 0) {
      return;
    }
    const merged = [...this.lines, ...this.pending];
    this.pending = [];
    this.lines = merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged;
  }

  private get visibleLines(): LogLine[] {
    const needle = this.filter.trim().toLowerCase();
    return needle === '' ? this.lines : this.lines.filter((log) => searchText(log).includes(needle));
  }

  private describeStatus(): { label: string; tone: string } {
    switch (this.status) {
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

  override render() {
    const status = this.describeStatus();
    const visible = this.visibleLines;
    const sinceFlag = this.since === 'now' ? '' : ` --since ${this.since}`;
    const command = MODES.find((mode) => mode.value === this.mode)?.command ?? 'clever logs';
    return html`
      <div class="row toolbar">
        <div class="seg" role="group" aria-label=${t('logs.modeAria')}>
          ${MODES.map(
            (mode) =>
              html`<button
                type="button"
                class=${mode.value === this.mode ? 'on' : ''}
                aria-pressed=${mode.value === this.mode}
                @click=${() => this.setMode(mode.value)}
              >
                ${t(mode.label)}
              </button>`,
          )}
        </div>
        <cvc-cli command=${`${command} --app ${this.appId}${sinceFlag}`}></cvc-cli>
        <span class="badge ${status.tone}">${status.label}</span>
        <span class="muted small"
          >${visible.length}${visible.length !== this.lines.length ? ` / ${this.lines.length}` : ''}
          ${t('logs.lines')}</span
        >
        <span class="grow"></span>
        <label class="row small">
          ${t('logs.since')}
          <select .value=${this.since} @change=${this.onSinceChange}>
            ${SINCE_OPTIONS.map((option) => html`<option value=${option.value} ?selected=${option.value === this.since}>${t(option.label)}</option>`)}
          </select>
        </label>
        <input
          type="search"
          placeholder=${t('logs.filter')}
          aria-label=${t('logs.filter')}
          .value=${this.filter}
          @input=${(event: Event) => (this.filter = (event.currentTarget as HTMLInputElement).value)}
        />
        <label class="row small">
          <input
            type="checkbox"
            .checked=${this.autoscroll}
            @change=${(event: Event) => (this.autoscroll = (event.currentTarget as HTMLInputElement).checked)}
          />
          ${t('logs.follow')}
        </label>
        <button type="button" class="ghost" ?disabled=${this.stream == null} @click=${this.togglePause}>
          ${this.status === 'paused' ? t('logs.resume') : t('logs.pause')}
        </button>
        ${
          this.stream == null
            ? html`<button type="button" class="ghost" @click=${this.start}>${t('logs.restart')}</button>`
            : html`<button type="button" class="ghost" @click=${this.stop}>${t('logs.stop')}</button>`
        }
        <button type="button" class="ghost" @click=${() => (this.lines = [])}>${t('logs.clear')}</button>
      </div>
      ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
      <div class="lines card ${this.mode}" role="log" aria-live="off">
        ${
          visible.length === 0
            ? html`<p class="empty">${this.status === 'open' ? t('logs.waiting') : ''}</p>`
            : repeat(
                visible,
                (log) => log.id,
                (log) => (isAccessLog(log) ? this.renderAccessLine(log) : this.renderAppLine(log)),
              )
        }
      </div>
    `;
  }

  private renderAppLine(log: ApplicationRuntimeLog) {
    return html`<div class="line sev-${log.severity}">
      <time datetime=${log.date} title=${log.date}>${formatTime(log.date)}</time>
      <span class="service" title=${log.instanceId}>${log.service}</span>
      <span class="message">${log.message}</span>
    </div>`;
  }

  /**
   * One request: time, status, method, path, duration, bytes sent, client address. The host the
   * API reports is the Clever Cloud load balancer, not the requested domain: it stays in the title.
   */
  private renderAccessLine(log: ApplicationAccessLog) {
    const { request, response } = log.detail;
    const place = [log.source.city, log.source.countryCode].filter((part) => part !== '' && part != null).join(', ');
    return html`<div class="line access s${Math.floor(response.statusCode / 100)}xx">
      <time datetime=${log.date} title=${log.date}>${formatTime(log.date)}</time>
      <span class="status">${response.statusCode}</span>
      <span class="method">${request.method}</span>
      <span class="message" title="${request.scheme} · ${request.host}">${request.path}</span>
      <span class="num">${response.time} ms</span>
      <span class="num">${formatBytes(log.bytesOut)}</span>
      <span class="ip" title=${place}>${log.source.ip}</span>
    </div>`;
  }

  private onSinceChange(event: Event): void {
    this.since = (event.currentTarget as HTMLSelectElement).value;
    this.lines = [];
    void this.start();
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }
      .toolbar {
        margin-bottom: 0.6rem;
      }
      .toolbar select,
      .toolbar input[type='search'] {
        padding: 0.3rem 0.5rem;
      }
      .toolbar input[type='search'] {
        width: 200px;
      }
      .grow {
        flex: 1;
      }
      .error.small {
        margin-bottom: 0.5rem;
      }
      .lines {
        flex: 1;
        min-height: 300px;
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
      .line.access {
        grid-template-columns: 8ch 3ch 7ch minmax(0, 1fr) 8ch 8ch 15ch;
        white-space: nowrap;
      }
      .line.access .message {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .line.access .method,
      .line.access .ip {
        color: var(--cvc-muted);
      }
      .line.access .num {
        text-align: right;
        color: var(--cvc-muted);
      }
      .line.access .ip {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .line.s2xx .status {
        color: var(--cvc-ok);
      }
      .line.s3xx .status {
        color: var(--cvc-info);
      }
      .line.s4xx .status {
        color: var(--cvc-warn);
      }
      .line.s5xx .status,
      .line.s5xx .message {
        color: var(--cvc-danger);
      }
    `,
  ];
}

function isAccessLog(log: LogLine): log is ApplicationAccessLog {
  return 'detail' in log;
}

/** What the filter field looks into. */
function searchText(log: LogLine): string {
  if (!isAccessLog(log)) {
    return log.message.toLowerCase();
  }
  const { request, response } = log.detail;
  return `${response.statusCode} ${request.method} ${request.host}${request.path} ${log.source.ip} ${log.source.city}`.toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readMode(): LogMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'access' ? 'access' : 'app';
  } catch {
    return 'app';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-logs': CvcAppLogs;
  }
}
