import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { deleteObjectCurl } from '../../core/addons/cellar.js';
import { describeError } from '../../core/clever-client.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { deleteCellarObject, objectDeletionRefusal, type CellarBucket, type CellarObjectItem } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { formatBytes } from '../shared/format.js';
import { sharedStyles } from '../shared/styles.js';
import { cellarDeleteStyles } from './cellar-delete-styles.js';

const REFUSALS: Readonly<Record<'cellar' | 'bucket' | 'network', MessageKey>> = {
  cellar: 'cellarUpload.refusal.cellar',
  bucket: 'cellarUpload.refusal.bucket',
  network: 'cellarDelete.refusal.network',
};

export interface ObjectDeletedDetail {
  key: string;
  /** It was gone before this deletion. */
  already: boolean;
}

/**
 * Confirms the deletion of one file of a Cellar bucket (#30), named with what
 * it means for this bucket. Cancel has the focus: Enter alone deletes nothing.
 * Emits `cvc-cellar-object-deleted`, or `cvc-cellar-object-delete-close`.
 */
@customElement('cvc-cellar-object-delete-dialog')
export class CvcCellarObjectDeleteDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  /** `cellar_…`: the platform routes want it. */
  @property() realId = '';
  @property() bucket = '';
  @property({ attribute: false }) item!: CellarObjectItem;
  /** The bucket's versioning, when known: it decides what the deletion means. */
  @property() versioning: CellarBucket['versioning'] | null = null;

  @state() private busy = false;
  @state() private error: string | null = null;

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('button.ghost')?.focus();
  }

  private close(): void {
    if (!this.busy) {
      this.dispatchEvent(new CustomEvent('cvc-cellar-object-delete-close', { bubbles: true, composed: true }));
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  private done(already: boolean): void {
    this.dispatchEvent(
      new CustomEvent<ObjectDeletedDetail>('cvc-cellar-object-deleted', {
        detail: { key: this.item.key, already },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async deleteFile(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      await deleteCellarObject(this.client, this.ownerId, this.realId, this.bucket, this.item.key);
      this.done(false);
    } catch (error) {
      const refusal = objectDeletionRefusal(error);
      if (refusal === 'gone') {
        this.done(true);
      } else {
        this.error = refusal == null ? describeError(error) : t(REFUSALS[refusal]);
      }
    } finally {
      this.busy = false;
    }
  }

  override render() {
    // Unknown counts as the worst case: only a known versioning keeps anything.
    const meaning: MessageKey =
      this.versioning === 'ENABLED'
        ? 'cellarDelete.versioned'
        : this.versioning === 'SUSPENDED'
          ? 'cellarDelete.suspended'
          : 'cellarDelete.forGood';
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <section
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="title"
        aria-describedby="meaning"
        @keydown=${this.onKeyDown}
      >
        <header>
          <h2 id="title">${t('cellarDelete.title')}</h2>
          <p class="mono small what">${this.bucket}/${this.item.key}</p>
          <p class="muted small">${formatBytes(this.item.contentLength)}</p>
        </header>
        <p id="meaning" class="notice small">${t(meaning)}</p>
        <div class="cli-block">
          <span class="muted small">${t('common.cliEquivalent')}</span>
          <cvc-cli block command=${deleteObjectCurl(this.ownerId, this.realId, this.bucket, this.item.key)}></cvc-cli>
        </div>
        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
        <footer class="row">
          <button type="button" class="ghost" ?disabled=${this.busy} @click=${this.close}>${t('common.cancel')}</button>
          <button type="button" class="danger" ?disabled=${this.busy} @click=${this.deleteFile}>
            ${this.busy ? t('common.busy') : t('action.delete.submit')}
          </button>
        </footer>
      </section>
    `;
  }

  static override styles = [sharedStyles, cellarDeleteStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-cellar-object-delete-dialog': CvcCellarObjectDeleteDialog;
  }
  interface HTMLElementEventMap {
    'cvc-cellar-object-deleted': CustomEvent<ObjectDeletedDetail>;
    'cvc-cellar-object-delete-close': CustomEvent<undefined>;
  }
}
