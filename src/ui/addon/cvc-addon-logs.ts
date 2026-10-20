import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../../core/i18n.js';
import { LogStream } from '../../core/logs/stream.js';
import { openAddonLogs, type AddonRuntimeLog } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { ICON_CLEAR, ICON_PAUSE, ICON_START, ICON_STOP } from '../shared/icons.js';
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

/** `clever logs --addon`: what a dedicated add-on writes, with pause, filter and replay window. */
@customElement('cvc-addon-logs')
export class CvcAddonLogs extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() addonId = '';

  @state() private since = '15m';
  @state() private filter = '';
  @state() private autoscroll = true;

  @query('.lines') private container?: HTMLElement;

  #stream: LogStream<AddonRuntimeLog> | null = null;
  private readonly onStreamChange = () => this.requestUpdate();

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('addonId')) {
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

  private open(): void {
    this.#stream?.stop();
    this.#stream?.removeEventListener('change', this.onStreamChange);
    this.#stream = null;
    if (this.client == null || this.addonId === '') {
      return;
    }
    const { client, ownerId, addonId } = this;
    const stream = new LogStream<AddonRuntimeLog>((since) => openAddonLogs(client, ownerId, addonId, { since }));
    stream.addEventListener('change', this.onStreamChange);
    this.#stream = stream;
    void stream.start(sinceMinutes(this.since));
  }

  override render() {
    const stream = this.#stream;
    const status = streamStatusLabel(stream?.status ?? 'idle');
    const lines = stream?.lines ?? [];
    const needle = this.filter.trim().toLowerCase();
    const visible = needle === '' ? lines : lines.filter((log) => runtimeSearchText(log).includes(needle));
    const error = streamError(stream?.error ?? null, stream?.retries ?? 0);
    const paused = stream?.status === 'paused';
    return html`
      <div class="toolbar">
        <div class="row">
          <cvc-cli command=${`clever logs --addon ${this.addonId}${sinceFlag(this.since)}`}></cvc-cli>
          <span class="badge ${status.tone}">${status.label}</span>
          <span class="muted small"
            >${visible.length}${visible.length !== lines.length ? ` / ${lines.length}` : ''} ${t('logs.lines')}</span
          >
        </div>
        <div class="row">
          <select
            aria-label=${t('logs.since')}
            title=${t('logs.since')}
            @change=${(event: Event) => {
              this.since = (event.currentTarget as HTMLSelectElement).value;
              stream?.clear();
              void stream?.start(sinceMinutes(this.since));
            }}
          >
            ${SINCE_OPTIONS.map(
              (option) =>
                html`<option value=${option.value} ?selected=${option.value === this.since}>
                  ${t(option.label)}
                </option>`,
            )}
          </select>
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
          <button
            type="button"
            class="ghost icon-only"
            title=${paused ? t('logs.resume') : t('logs.pause')}
            aria-label=${paused ? t('logs.resume') : t('logs.pause')}
            ?disabled=${!stream?.running}
            @click=${() => stream?.togglePause()}
          >
            ${paused ? ICON_START : ICON_PAUSE}
          </button>
          ${
            stream?.running
              ? html`<button
                  type="button"
                  class="ghost icon-only"
                  title=${t('logs.stop')}
                  aria-label=${t('logs.stop')}
                  @click=${() => stream.stop()}
                >
                  ${ICON_STOP}
                </button>`
              : html`<button
                  type="button"
                  class="ghost with-icon"
                  @click=${() => void stream?.start(sinceMinutes(this.since))}
                >
                  ${ICON_START} ${t('logs.restart')}
                </button>`
          }
          <button
            type="button"
            class="ghost icon-only"
            title=${t('logs.clear')}
            aria-label=${t('logs.clear')}
            @click=${() => stream?.clear()}
          >
            ${ICON_CLEAR}
          </button>
        </div>
      </div>
      ${error ? html`<p class="error small" role="alert">${error}</p>` : nothing}
      <div class="lines card" role="log" aria-live="off">
        ${
          visible.length === 0
            ? html`<p class="empty">${stream?.status === 'open' ? t('logs.waiting') : ''}</p>`
            : repeat(
                visible,
                (log) => log.id,
                // The platform marks every line of an add-on "emerg": no colour from that.
                (log) => renderRuntimeLine(log, nothing, null, false),
              )
        }
      </div>
    `;
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
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem 1rem;
        margin-bottom: 0.6rem;
      }
      .toolbar > .row {
        flex-wrap: nowrap;
        min-width: 0;
      }
      .toolbar cvc-cli {
        max-width: 16rem;
      }
      .toolbar select,
      .toolbar input[type='search'] {
        padding: 0.3rem 0.5rem;
      }
      .toolbar input[type='search'] {
        width: 150px;
      }
      button.icon-only {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.45rem 0.55rem;
      }
      .error.small {
        margin-bottom: 0.5rem;
      }
      .lines {
        flex: 1;
        min-height: 300px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-addon-logs': CvcAddonLogs;
  }
}
