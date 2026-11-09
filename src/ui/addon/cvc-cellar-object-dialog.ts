import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { objectCurl, s3cmdGet } from '../../core/addons/cellar.js';
import { describeError } from '../../core/clever-client.js';
import { t } from '../../core/i18n.js';
import { fetchCellarObject, type CellarObjectDetails, type CellarObjectItem } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { copyToClipboard } from '../shared/clipboard.js';
import { CvcElement } from '../shared/cvc-element.js';
import { formatBytes, formatCount, formatDateTime, formatRelative } from '../shared/format.js';
import { ICON_DOWNLOAD, ICON_TRASH } from '../shared/icons.js';
import { sharedStyles } from '../shared/styles.js';
import { openCellarDownload } from './cellar-download.js';

/** How long the copy button says "Copied!". */
const COPIED_FOR = 1500;

/**
 * One Cellar object (#30): what the listing knows straight away, then what one
 * `GET …/objects/<key>` adds (content type, tags, user metadata), with its
 * download. The access list is left out: the API names no group, so it cannot
 * tell whether the object is public. Emits `cvc-cellar-object-close`,
 * `cvc-cellar-object-missing` when the key is gone, for the list to reload,
 * and `cvc-cellar-object-delete` when Delete is asked for: the page confirms.
 */
@customElement('cvc-cellar-object-dialog')
export class CvcCellarObjectDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  /** `addon_…`: what `clever addon env` takes, in the s3cmd command. */
  @property() addonId = '';
  /** `cellar_…`: the platform routes want it. */
  @property() realId = '';
  @property() bucket = '';
  /** The entry of the listing that was opened. */
  @property({ attribute: false }) item!: CellarObjectItem;

  @state() private details: CellarObjectDetails | null = null;
  @state() private loading = false;
  @state() private missing = false;
  @state() private error: string | null = null;
  /** The key, just copied: its button says "Copied!" a moment. */
  @state() private copied: string | null = null;
  @state() private signing = false;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('item') || changed.has('bucket') || changed.has('realId')) {
      void this.load();
    }
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('button.close')?.focus();
  }

  private async load(): Promise<void> {
    if (this.client == null || this.item == null) {
      return;
    }
    const key = this.item.key;
    this.details = null;
    this.missing = false;
    this.error = null;
    this.loading = true;
    try {
      const details = await fetchCellarObject(this.client, this.ownerId, this.realId, this.bucket, key);
      if (this.item.key !== key) {
        return;
      }
      if (details == null) {
        this.missing = true;
        this.dispatchEvent(new CustomEvent('cvc-cellar-object-missing', { bubbles: true, composed: true }));
      } else {
        this.details = details;
      }
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.loading = false;
    }
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('cvc-cellar-object-close', { bubbles: true, composed: true }));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  private async copy(text: string): Promise<void> {
    if (!(await copyToClipboard(text))) {
      this.error = t('env.clipboardError');
      return;
    }
    this.copied = text;
    setTimeout(() => {
      if (this.copied === text) {
        this.copied = null;
      }
    }, COPIED_FOR);
  }

  private async download(): Promise<void> {
    this.signing = true;
    this.error = null;
    try {
      await openCellarDownload(this.client, this.ownerId, this.realId, this.bucket, this.item.key);
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.signing = false;
    }
  }

  override render() {
    // The details are fresher than the listing once they are in.
    const object = this.details ?? this.item;
    const metadata = Object.entries(this.details?.metadata ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const tags = this.details?.tags ?? [];
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="title" @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t('cellarObject.title')}</h2>
          <p class="mono name">${this.item.name}</p>
        </header>
        ${this.missing ? html`<p class="error" role="alert">${t('cellarObject.missing')}</p>` : nothing}
        <dl class="facts">
          <dt>${t('cellarObject.key')}</dt>
          <dd class="copyable">
            <span class="mono">${this.item.key}</span>
            <button type="button" class="ghost small" @click=${() => this.copy(this.item.key)}>
              ${this.copied === this.item.key ? t('common.copied') : t('common.copy')}
            </button>
          </dd>
          <dt>${t('cellarObject.contentType')}</dt>
          <dd class="mono">
            ${this.details?.contentType ?? html`<span class="muted">${this.loading ? '…' : '—'}</span>`}
          </dd>
          <dt>${t('cellarObject.size')}</dt>
          <dd>
            ${formatBytes(object.contentLength)}
            <span class="muted small">
              · ${t('cellarObject.bytes', { count: object.contentLength, bytes: formatCount(object.contentLength) })}
            </span>
          </dd>
          <dt>${t('cellarObject.updated')}</dt>
          <dd title=${formatRelative(object.updatedAt)}>${formatDateTime(object.updatedAt)}</dd>
          <dt>${t('cellarObject.etag')}</dt>
          <dd class="mono">${object.eTag}</dd>
          ${
            tags.length === 0
              ? nothing
              : html`<dt>${t('cellarObject.tags')}</dt>
                  <dd class="tags">
                    ${tags.map((tag) => html`<span class="badge neutral mono">${tag.key}=${tag.value}</span>`)}
                  </dd>`
          }
        </dl>
        ${
          metadata.length === 0
            ? nothing
            : html`<details class="metadata">
                <summary>${t('cellarObject.metadata', { count: metadata.length })}</summary>
                <dl>
                  ${metadata.map(
                    ([name, value]) =>
                      html`<dt class="mono">${name}</dt>
                        <dd class="mono">${value}</dd>`,
                  )}
                </dl>
              </details>`
        }
        <div class="cli-block">
          <span class="muted small">${t('cellarObject.s3cmd')}</span>
          <cvc-cli block command=${s3cmdGet(this.addonId, this.bucket, this.item.key)}></cvc-cli>
        </div>
        <div class="cli-block">
          <span class="muted small">${t('cellarObject.cli')}</span>
          <cvc-cli block command=${objectCurl(this.ownerId, this.realId, this.bucket, this.item.key)}></cvc-cli>
        </div>
        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
        <footer class="row">
          <button
            type="button"
            class="ghost with-icon delete"
            ?disabled=${this.missing}
            @click=${() =>
              this.dispatchEvent(new CustomEvent('cvc-cellar-object-delete', { bubbles: true, composed: true }))}
          >
            ${ICON_TRASH} ${t('action.delete.submit')}
          </button>
          <button type="button" class="ghost close" @click=${this.close}>${t('common.close')}</button>
          <button
            type="button"
            class="primary with-icon"
            ?disabled=${this.signing || this.missing}
            @click=${this.download}
          >
            ${ICON_DOWNLOAD} ${t('buckets.download')}
          </button>
        </footer>
      </section>
    `;
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
        width: min(620px, calc(100vw - 2rem));
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
      }
      .name,
      dd {
        overflow-wrap: anywhere;
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.4rem 1rem;
        margin: 0;
      }
      dt {
        color: var(--cvc-muted);
      }
      dd {
        margin: 0;
        min-width: 0;
      }
      dd.copyable {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
      }
      dd.copyable button {
        flex: none;
      }
      dd.tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
      }
      .metadata summary {
        cursor: pointer;
      }
      .metadata dl {
        margin-top: 0.5rem;
        font-size: 0.85rem;
      }
      button.small {
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
      }
      .cli-block {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      footer {
        justify-content: flex-end;
        gap: 0.5rem;
      }
      button.delete {
        margin-right: auto;
      }
      button.delete:not(:disabled):hover,
      button.delete:focus-visible {
        color: var(--cvc-danger);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-cellar-object-dialog': CvcCellarObjectDialog;
  }
  interface HTMLElementEventMap {
    'cvc-cellar-object-close': CustomEvent<undefined>;
    'cvc-cellar-object-missing': CustomEvent<undefined>;
    'cvc-cellar-object-delete': CustomEvent<undefined>;
  }
}
