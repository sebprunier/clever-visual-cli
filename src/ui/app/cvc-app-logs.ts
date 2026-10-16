import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import { openRuntimeLogs, type ApplicationRuntimeLog, type LogsStream } from '../../data/api.js';
import { formatTime } from '../shared/format.js';
import { sharedStyles } from '../shared/styles.js';

type StreamStatus = 'idle' | 'connecting' | 'open' | 'paused' | 'closed' | 'error';

const MAX_LINES = 2000;
const SINCE_OPTIONS: Array<{ value: string; label: string; minutes: number }> = [
  { value: 'now', label: 'maintenant', minutes: 0 },
  { value: '15m', label: '15 dernières minutes', minutes: 15 },
  { value: '1h', label: 'dernière heure', minutes: 60 },
  { value: '6h', label: '6 dernières heures', minutes: 360 },
  { value: '24h', label: 'dernières 24 heures', minutes: 1440 },
];

/** Live runtime logs: the `clever logs` stream with pause, filter and replay window. */
@customElement('cvc-app-logs')
export class CvcAppLogs extends LitElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';

  @state() private status: StreamStatus = 'idle';
  @state() private error: string | null = null;
  @state() private since = '15m';
  @state() private filter = '';
  @state() private autoscroll = true;
  @state() private lines: ApplicationRuntimeLog[] = [];

  @query('.lines') private container?: HTMLElement;

  private stream: LogsStream<ApplicationRuntimeLog> | null = null;
  private pending: ApplicationRuntimeLog[] = [];
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
    const { client, ownerId, appId } = this;
    const minutes = SINCE_OPTIONS.find((option) => option.value === this.since)?.minutes ?? 0;
    this.status = 'connecting';
    this.error = null;
    try {
      const stream = await openRuntimeLogs(client, ownerId, appId, {
        since: minutes > 0 ? new Date(Date.now() - minutes * 60_000) : new Date(),
      });
      if (this.appId !== appId) {
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

  private enqueue(log: ApplicationRuntimeLog): void {
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

  private get visibleLines(): ApplicationRuntimeLog[] {
    const needle = this.filter.trim().toLowerCase();
    return needle === '' ? this.lines : this.lines.filter((log) => log.message.toLowerCase().includes(needle));
  }

  private describeStatus(): { label: string; tone: string } {
    switch (this.status) {
      case 'connecting':
        return { label: 'connexion…', tone: 'warn' };
      case 'open':
        return { label: 'en direct', tone: 'ok' };
      case 'paused':
        return { label: 'en pause', tone: 'warn' };
      case 'closed':
        return { label: 'arrêté', tone: 'neutral' };
      case 'error':
        return { label: 'erreur', tone: 'danger' };
      default:
        return { label: '', tone: 'neutral' };
    }
  }

  override render() {
    const status = this.describeStatus();
    const visible = this.visibleLines;
    const sinceFlag = this.since === 'now' ? '' : ` --since ${this.since}`;
    return html`
      <div class="row toolbar">
        <span class="cli">clever logs --app ${this.appId}${sinceFlag}</span>
        <span class="badge ${status.tone}">${status.label}</span>
        <span class="muted small"
          >${visible.length}${visible.length !== this.lines.length ? ` / ${this.lines.length}` : ''} lignes</span
        >
        <span class="grow"></span>
        <label class="row small">
          Depuis
          <select .value=${this.since} @change=${this.onSinceChange}>
            ${SINCE_OPTIONS.map((option) => html`<option value=${option.value} ?selected=${option.value === this.since}>${option.label}</option>`)}
          </select>
        </label>
        <input
          type="search"
          placeholder="Filtrer les lignes…"
          aria-label="Filtrer les lignes"
          .value=${this.filter}
          @input=${(event: Event) => (this.filter = (event.currentTarget as HTMLInputElement).value)}
        />
        <label class="row small">
          <input
            type="checkbox"
            .checked=${this.autoscroll}
            @change=${(event: Event) => (this.autoscroll = (event.currentTarget as HTMLInputElement).checked)}
          />
          Suivre
        </label>
        <button type="button" class="ghost" ?disabled=${this.stream == null} @click=${this.togglePause}>
          ${this.status === 'paused' ? 'Reprendre' : 'Pause'}
        </button>
        ${
          this.stream == null
            ? html`<button type="button" class="ghost" @click=${this.start}>Relancer</button>`
            : html`<button type="button" class="ghost" @click=${this.stop}>Arrêter</button>`
        }
        <button type="button" class="ghost" @click=${() => (this.lines = [])}>Effacer</button>
      </div>
      ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
      <div class="lines card" role="log" aria-live="off">
        ${
          visible.length === 0
            ? html`<p class="empty">${this.status === 'open' ? 'Connecté, en attente de lignes.' : ''}</p>`
            : repeat(
                visible,
                (log) => log.id,
                (log) =>
                  html`<div class="line sev-${log.severity}">
                    <time datetime=${log.date} title=${log.date}>${formatTime(log.date)}</time>
                    <span class="service" title=${log.instanceId}>${log.service}</span>
                    <span class="message">${log.message}</span>
                  </div>`,
              )
        }
      </div>
    `;
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
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-logs': CvcAppLogs;
  }
}
