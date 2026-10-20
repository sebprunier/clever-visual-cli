import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { LogStream } from '../../core/logs/stream.js';
import {
  openAccessLogs,
  openRuntimeLogs,
  type ApplicationAccessLog,
  type ApplicationRuntimeLog,
} from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { formatTime } from '../shared/format.js';
import {
  logStyles,
  renderRuntimeLine,
  runtimeSearchText,
  SINCE_OPTIONS,
  sinceFlag,
  sinceMinutes,
  streamError,
  streamStatusLabel,
} from '../shared/logs.js';
import { sharedStyles } from '../shared/styles.js';

/** What the application writes, or the HTTP requests it answered. */
type LogMode = 'app' | 'access';
type LogLine = ApplicationRuntimeLog | ApplicationAccessLog;

const MODE_KEY = 'cvc.logs.mode';
const MODES: Array<{ value: LogMode; label: MessageKey; command: string }> = [
  { value: 'app', label: 'logs.mode.app', command: 'clever logs' },
  { value: 'access', label: 'logs.mode.access', command: 'clever accesslogs' },
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
  @state() private since = '15m';
  @state() private filter = '';
  @state() private autoscroll = true;

  @query('.lines') private container?: HTMLElement;

  #stream: LogStream<LogLine> | null = null;
  private readonly onStreamChange = () => this.requestUpdate();

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId')) {
      this.open();
    }
  }

  override updated(): void {
    if (this.autoscroll && this.container != null) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  override disconnectedCallback(): void {
    this.#stream?.stop();
    this.#stream?.removeEventListener('change', this.onStreamChange);
    super.disconnectedCallback();
  }

  /** A fresh stream for the application and kind of logs shown. */
  private open(): void {
    this.#stream?.stop();
    this.#stream?.removeEventListener('change', this.onStreamChange);
    this.#stream = null;
    if (this.client == null || this.appId === '') {
      return;
    }
    const { client, ownerId, appId, mode } = this;
    const stream = new LogStream<LogLine>((since) =>
      mode === 'app'
        ? openRuntimeLogs(client, ownerId, appId, { since })
        : openAccessLogs(client, ownerId, appId, { since }),
    );
    stream.addEventListener('change', this.onStreamChange);
    this.#stream = stream;
    void stream.start(sinceMinutes(this.since));
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
    this.open();
  }

  private get visibleLines(): LogLine[] {
    const lines = this.#stream?.lines ?? [];
    const needle = this.filter.trim().toLowerCase();
    return needle === '' ? lines : lines.filter((log) => searchText(log).includes(needle));
  }

  override render() {
    const stream = this.#stream;
    const status = streamStatusLabel(stream?.status ?? 'idle');
    const total = stream?.lines.length ?? 0;
    const visible = this.visibleLines;
    const error = streamError(stream?.error ?? null, stream?.retries ?? 0);
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
        <cvc-cli command=${`${command} --app ${this.appId}${sinceFlag(this.since)}`}></cvc-cli>
        <span class="badge ${status.tone}">${status.label}</span>
        <span class="muted small"
          >${visible.length}${visible.length !== total ? ` / ${total}` : ''} ${t('logs.lines')}</span
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
        <button type="button" class="ghost" ?disabled=${!stream?.running} @click=${() => stream?.togglePause()}>
          ${stream?.status === 'paused' ? t('logs.resume') : t('logs.pause')}
        </button>
        ${
          stream?.running
            ? html`<button type="button" class="ghost" @click=${() => stream.stop()}>${t('logs.stop')}</button>`
            : html`<button type="button" class="ghost" @click=${() => void stream?.start(sinceMinutes(this.since))}>
                ${t('logs.restart')}
              </button>`
        }
        <button type="button" class="ghost" @click=${() => stream?.clear()}>${t('logs.clear')}</button>
      </div>
      ${error ? html`<p class="error small" role="alert">${error}</p>` : nothing}
      <div class="lines card ${this.mode}" role="log" aria-live="off">
        ${
          visible.length === 0
            ? html`<p class="empty">${stream?.status === 'open' ? t('logs.waiting') : ''}</p>`
            : repeat(
                visible,
                (log) => log.id,
                (log) => (isAccessLog(log) ? this.renderAccessLine(log) : renderRuntimeLine(log)),
              )
        }
      </div>
    `;
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
    this.#stream?.clear();
    void this.#stream?.start(sinceMinutes(this.since));
  }

  static override styles = [
    sharedStyles,
    logStyles,
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
    return runtimeSearchText(log);
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
