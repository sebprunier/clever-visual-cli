import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { planUpload, s3cmdPut, sendable, type UploadEntry } from '../../core/addons/cellar.js';
import { describeError } from '../../core/clever-client.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { fetchCellarObject, uploadCellarObject, uploadRefusal, type CellarBucket } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { formatBytes } from '../shared/format.js';
import { sharedStyles } from '../shared/styles.js';

/** How many keys are checked at once before the upload. */
const CHECKS_AT_ONCE = 4;

const REFUSALS: Readonly<Record<NonNullable<ReturnType<typeof uploadRefusal>>, MessageKey>> = {
  cellar: 'cellarUpload.refusal.cellar',
  bucket: 'cellarUpload.refusal.bucket',
  refused: 'cellarUpload.refusal.refused',
  network: 'cellarUpload.refusal.network',
};

type Phase = 'checking' | 'ready' | 'sending' | 'done';
type FileState = { state: 'waiting' | 'sending' | 'sent' } | { state: 'failed'; error: string };

export interface UploadCloseDetail {
  /** How many files went through: the folder reloads when there is one. */
  sent: number;
}

/**
 * Uploads files into the open folder of a Cellar bucket (#30). Before
 * anything is sent, each key is checked (one `GET`) so the dialog can say
 * which objects get replaced; then the files go one after the other, each
 * with its state, and Stop ends after the current one. Emits
 * `cvc-cellar-upload-close` with how many were sent.
 */
@customElement('cvc-cellar-upload-dialog')
export class CvcCellarUploadDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  /** `addon_…`: what `clever addon env` takes, in the s3cmd command. */
  @property() addonId = '';
  /** `cellar_…`: the platform routes want it. */
  @property() realId = '';
  @property() bucket = '';
  @property() folder = '';
  /** The bucket's versioning, when known: it decides what "replaces" means. */
  @property() versioning: CellarBucket['versioning'] | null = null;
  @property({ attribute: false }) files: File[] = [];

  @state() private phase: Phase = 'checking';
  @state() private checked = 0;
  @state() private entries: UploadEntry[] = [];
  /** By key, for the files that are sent. */
  @state() private states: Record<string, FileState> = {};
  @state() private stopping = false;
  @state() private error: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('files')) {
      void this.check();
    }
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('button.ghost')?.focus();
  }

  /**
   * The footer's buttons change with the phase: the focus follows (Stop, then Close) so it never
   * falls back to the page, where Escape would not reach the dialog.
   */
  // A plain PropertyValues: the typed one only knows public properties, not the private phase.
  override updated(changed: PropertyValues): void {
    if (changed.has('phase') && (this.phase === 'sending' || this.phase === 'done')) {
      this.renderRoot.querySelector<HTMLElement>('footer button')?.focus();
    }
  }

  /** One `GET` per key, a few at a time: which objects the upload would replace. */
  private async check(): Promise<void> {
    const files = this.files;
    this.phase = 'checking';
    this.checked = 0;
    this.error = null;
    this.entries = planUpload(this.folder, files, new Set());
    const keys = [...new Set(this.entries.map((entry) => entry.key))];
    const existing = new Set<string>();
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < keys.length) {
        const key = keys[next++];
        try {
          if ((await fetchCellarObject(this.client, this.ownerId, this.realId, this.bucket, key)) != null) {
            existing.add(key);
          }
        } catch (error) {
          this.error = t('cellarUpload.checkFailed', { error: describeError(error) });
        }
        this.checked += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CHECKS_AT_ONCE, keys.length) }, worker));
    if (this.files !== files) {
      return;
    }
    this.entries = planUpload(this.folder, files, existing);
    this.phase = 'ready';
  }

  private async send(): Promise<void> {
    const toSend = sendable(this.entries);
    if (this.phase !== 'ready' || toSend.length === 0) {
      return;
    }
    this.phase = 'sending';
    this.stopping = false;
    this.states = Object.fromEntries(toSend.map((entry) => [entry.key, { state: 'waiting' } as FileState]));
    const byKey = new Map(this.files.map((file) => [this.folder + file.name, file]));
    for (const entry of toSend) {
      if (this.stopping) {
        break;
      }
      const file = byKey.get(entry.key);
      if (file == null) {
        continue;
      }
      this.states = { ...this.states, [entry.key]: { state: 'sending' } };
      try {
        await uploadCellarObject(this.client, this.ownerId, this.realId, this.bucket, entry.key, file);
        this.states = { ...this.states, [entry.key]: { state: 'sent' } };
      } catch (error) {
        const refusal = uploadRefusal(error);
        const message = refusal == null ? describeError(error) : t(REFUSALS[refusal]);
        this.states = { ...this.states, [entry.key]: { state: 'failed', error: message } };
      }
    }
    this.phase = 'done';
  }

  private get sentCount(): number {
    return Object.values(this.states).filter((entry) => entry.state === 'sent').length;
  }

  private close(): void {
    if (this.phase === 'sending') {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<UploadCloseDetail>('cvc-cellar-upload-close', {
        detail: { sent: this.sentCount },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  override render() {
    const toSend = sendable(this.entries);
    const replaced = this.entries.filter((entry) => entry.exists && !entry.duplicate).length;
    const count = this.files.length;
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="title" @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t('cellarUpload.title', { count })}</h2>
          <p class="muted small mono">${this.bucket}/${this.folder}</p>
        </header>
        ${
          this.phase === 'checking'
            ? html`<p class="muted small" role="status">
                ${t('cellarUpload.checking', { done: this.checked, total: new Set(this.entries.map((e) => e.key)).size })}
              </p>`
            : nothing
        }
        <div class="files">
          <table>
            <tbody>
              ${this.entries.map(
                (entry) =>
                  html`<tr>
                    <td class="mono name">${entry.name}</td>
                    <td class="num">${formatBytes(entry.size)}</td>
                    <td class="state">${this.renderState(entry)}</td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>
        ${
          replaced > 0 && this.phase !== 'checking'
            ? html`<p class="notice small">
                ${t(this.versioning === 'ENABLED' ? 'cellarUpload.keptAsVersion' : 'cellarUpload.replacedForGood', {
                  count: replaced,
                })}
              </p>`
            : nothing
        }
        <div class="cli-block">
          <span class="muted small">${t('cellarUpload.s3cmd')}</span>
          <cvc-cli
            block
            command=${s3cmdPut(
              this.addonId,
              this.bucket,
              this.folder,
              this.entries.filter((entry) => !entry.duplicate).map((entry) => entry.name),
            )}
          ></cvc-cli>
        </div>
        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
        <footer class="row">${this.renderFooter(toSend.length)}</footer>
      </section>
    `;
  }

  private renderState(entry: UploadEntry) {
    if (entry.duplicate) {
      return html`<span class="muted">${t('cellarUpload.duplicate')}</span>`;
    }
    const sending = this.states[entry.key];
    if (sending != null) {
      switch (sending.state) {
        case 'waiting':
          // Still waiting once it is over: Stop came first.
          return html`<span class="muted"
            >${t(this.phase === 'done' ? 'cellarUpload.notSent' : 'cellarUpload.waiting')}</span
          >`;
        case 'sending':
          return html`<span>${t('cellarUpload.sending')}</span>`;
        case 'sent':
          return html`<span class="ok">${t('cellarUpload.sent')}</span>`;
        case 'failed':
          return html`<span class="fail">${t('cellarUpload.failed', { error: sending.error })}</span>`;
      }
    }
    if (this.phase === 'checking') {
      return html`<span class="muted">…</span>`;
    }
    if (this.phase === 'done') {
      return html`<span class="muted">${t('cellarUpload.notSent')}</span>`;
    }
    return entry.exists
      ? html`<span class="badge warn">${t('cellarUpload.replaces')}</span>`
      : html`<span class="muted">${t('cellarUpload.new')}</span>`;
  }

  private renderFooter(sendableCount: number) {
    if (this.phase === 'sending') {
      const done = Object.values(this.states).filter(
        (entry) => entry.state === 'sent' || entry.state === 'failed',
      ).length;
      return html`<span class="muted small grow" role="status">
          ${t('cellarUpload.progress', { done, total: Object.keys(this.states).length })}
        </span>
        <button type="button" class="ghost" ?disabled=${this.stopping} @click=${() => (this.stopping = true)}>
          ${this.stopping ? t('cellarUpload.stopping') : t('cellarUpload.stop')}
        </button>`;
    }
    if (this.phase === 'done') {
      const failed = Object.values(this.states).filter((entry) => entry.state === 'failed').length;
      return html`<span class="small grow" role="status">
          ${t('cellarUpload.summary', { count: this.sentCount })}
          ${failed > 0 ? html`<span class="fail">${t('cellarUpload.summaryFailed', { count: failed })}</span>` : nothing}
        </span>
        <button type="button" class="primary" @click=${this.close}>${t('common.close')}</button>`;
    }
    return html`<button type="button" class="ghost" @click=${this.close}>${t('common.cancel')}</button>
      <button
        type="button"
        class="primary"
        ?disabled=${this.phase !== 'ready' || sendableCount === 0}
        @click=${this.send}
      >
        ${t('cellarUpload.submit', { count: sendableCount })}
      </button>`;
  }

  static override styles = [
    sharedStyles,
    css`
      .backdrop {
        position: fixed;
        inset: 0;
        background: var(--cvc-backdrop);
        z-index: 40;
      }
      .dialog {
        position: fixed;
        top: 8vh;
        left: 50%;
        transform: translateX(-50%);
        width: min(640px, calc(100vw - 2rem));
        max-height: 84vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        padding: 1.25rem 1.5rem;
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: 12px;
        box-shadow: var(--cvc-shadow-pop);
        z-index: 41;
      }
      header p {
        margin: 0.3rem 0 0;
        overflow-wrap: anywhere;
      }
      .files {
        max-height: 40vh;
        overflow: auto;
        border: 1px solid var(--cvc-border);
        border-radius: 8px;
      }
      table {
        width: 100%;
      }
      td {
        padding: 0.35rem 0.6rem;
        vertical-align: baseline;
      }
      td.name {
        overflow-wrap: anywhere;
      }
      td.num {
        text-align: right;
        white-space: nowrap;
      }
      td.state {
        text-align: right;
        font-size: 0.85rem;
      }
      .ok {
        color: var(--cvc-ok);
      }
      /* Inline, in a cell or the summary: the shared .error is an alert box. */
      .fail {
        color: var(--cvc-danger);
      }
      .notice {
        margin: 0;
        padding: 0.5rem 0.7rem;
        border-left: 3px solid var(--cvc-accent);
        background: color-mix(in srgb, var(--cvc-accent) 8%, transparent);
        border-radius: 4px;
      }
      .cli-block {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      footer {
        justify-content: flex-end;
        align-items: center;
        gap: 0.5rem;
      }
      .grow {
        flex: 1;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-cellar-upload-dialog': CvcCellarUploadDialog;
  }
  interface HTMLElementEventMap {
    'cvc-cellar-upload-close': CustomEvent<UploadCloseDetail>;
  }
}
