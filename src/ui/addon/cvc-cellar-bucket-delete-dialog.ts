import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { deleteBucketCurl, needsPurge, type BucketContents } from '../../core/addons/cellar.js';
import { describeError } from '../../core/clever-client.js';
import { confirmsName } from '../../core/danger-zone.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { bucketDeletionRefusal, deleteCellarBucket, fetchCellarBucketContents } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { formatBytes, formatCount } from '../shared/format.js';
import { sharedStyles } from '../shared/styles.js';
import { cellarDeleteStyles } from './cellar-delete-styles.js';

export interface BucketDeletedDetail {
  bucket: string;
  /** It was gone before this deletion, or the answer to it got lost. */
  already: boolean;
}

/**
 * Deletes a Cellar bucket (#30). The bucket is read again first, the dialog
 * says what goes with it, and its name has to be typed. The purge is sent only
 * when the dialog showed something to purge: a refusal, or a call with no
 * answer (the purge may be going on), reads the bucket again and asks anew.
 * Emits `cvc-cellar-bucket-deleted`, or `cvc-cellar-bucket-delete-close`.
 */
@customElement('cvc-cellar-bucket-delete-dialog')
export class CvcCellarBucketDeleteDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  /** `cellar_…`: the platform routes want it. */
  @property() realId = '';
  @property() bucket = '';

  /** Null until read, and when the reading failed: nothing can be deleted then. */
  @state() private contents: BucketContents | null = null;
  @state() private reading = true;
  @state() private typed = '';
  @state() private busy = false;
  /** Why the dialog asks again. */
  @state() private warning: MessageKey | null = null;
  @state() private error: string | null = null;

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('button.ghost')?.focus();
    void this.read();
  }

  /** The field takes the focus each time the dialog is ready for the name. */
  // A plain PropertyValues: the typed one only knows public properties, not the private state.
  override updated(changed: PropertyValues): void {
    if ((changed.has('reading') || changed.has('busy')) && !this.reading && !this.busy && this.contents != null) {
      this.renderRoot.querySelector<HTMLElement>('input')?.focus();
    }
  }

  private async read(refused = false): Promise<void> {
    this.reading = true;
    try {
      const contents = await fetchCellarBucketContents(this.client, this.ownerId, this.realId, this.bucket);
      if (contents == null) {
        this.done(true);
        return;
      }
      this.contents = { ...contents, refused };
      this.typed = '';
    } catch (error) {
      this.contents = null;
      this.error = describeError(error);
    } finally {
      this.reading = false;
    }
  }

  private close(): void {
    if (!this.busy) {
      this.dispatchEvent(new CustomEvent('cvc-cellar-bucket-delete-close', { bubbles: true, composed: true }));
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
      new CustomEvent<BucketDeletedDetail>('cvc-cellar-bucket-deleted', {
        detail: { bucket: this.bucket, already },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private get ready(): boolean {
    return this.contents != null && !this.reading && !this.busy && confirmsName(this.typed, this.bucket);
  }

  private async deleteBucket(event: Event): Promise<void> {
    event.preventDefault();
    const contents = this.contents;
    if (contents == null || !this.ready) {
      return;
    }
    this.busy = true;
    this.error = null;
    this.warning = null;
    try {
      await deleteCellarBucket(this.client, this.ownerId, this.realId, this.bucket, needsPurge(contents));
      this.done(false);
    } catch (error) {
      await this.afterFailure(error);
    } finally {
      this.busy = false;
    }
  }

  private async afterFailure(error: unknown): Promise<void> {
    switch (bucketDeletionRefusal(error)) {
      case 'gone':
        this.done(true);
        return;
      case 'cellar':
        this.error = t('cellarUpload.refusal.cellar');
        return;
      case 'notEmpty':
        this.warning = 'cellarBucketDelete.refused';
        await this.read(true);
        return;
      case 'network':
        this.warning = 'cellarBucketDelete.uncertain';
        await this.read();
        return;
      default:
        this.error = describeError(error);
        await this.read();
    }
  }

  /** What goes with the bucket, in the dialog's own terms. */
  private renderContents() {
    const contents = this.contents;
    if (contents == null) {
      return this.reading ? html`<p class="muted small">${t('cellarBucketDelete.reading')}</p>` : nothing;
    }
    if (!needsPurge(contents)) {
      return html`<p id="meaning" class="small">${t('cellarBucketDelete.empty')}</p>`;
    }
    const message =
      contents.objects > 0
        ? t('cellarBucketDelete.holds', {
            count: contents.objects,
            objects: formatCount(contents.objects),
            size: formatBytes(contents.sizeInBytes),
          })
        : t(contents.listed ? 'cellarBucketDelete.notCounted' : 'cellarBucketDelete.notListed');
    return html`<div id="meaning" class="notice small">
      <p>${message}</p>
      ${contents.versioned && contents.objects > 0 ? html`<p class="muted">${t('cellarBucketDelete.countsVersions')}</p>` : nothing}
    </div>`;
  }

  override render() {
    const contents = this.contents;
    const label = t('action.delete.confirm', { name: this.bucket });
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <form
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="title"
        aria-describedby="meaning"
        @submit=${this.deleteBucket}
        @keydown=${this.onKeyDown}
      >
        <header>
          <h2 id="title">${t('cellarBucketDelete.title')}</h2>
          <p class="mono small what">${this.bucket}</p>
        </header>
        ${this.warning == null ? nothing : html`<p class="warning small" role="alert">${t(this.warning)}</p>`}
        ${this.renderContents()}
        ${
          contents == null
            ? nothing
            : html`<label class="field">
                  <span>${label}</span>
                  <input
                    class="mono"
                    autocomplete="off"
                    spellcheck="false"
                    .value=${this.typed}
                    ?disabled=${this.reading || this.busy}
                    @input=${(event: Event) => (this.typed = (event.currentTarget as HTMLInputElement).value)}
                  />
                </label>
                <div class="cli-block">
                  <span class="muted small">${t('common.cliEquivalent')}</span>
                  <cvc-cli
                    block
                    command=${deleteBucketCurl(this.ownerId, this.realId, this.bucket, needsPurge(contents))}
                  ></cvc-cli>
                </div>`
        }
        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
        <footer class="row">
          <button type="button" class="ghost" ?disabled=${this.busy} @click=${this.close}>${t('common.cancel')}</button>
          <button type="submit" class="danger" ?disabled=${!this.ready}>
            ${this.busy ? t('common.busy') : t('action.delete.submit')}
          </button>
        </footer>
      </form>
    `;
  }

  static override styles = [
    sharedStyles,
    cellarDeleteStyles,
    css`
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .warning {
        font-weight: 600;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-cellar-bucket-delete-dialog': CvcCellarBucketDeleteDialog;
  }
  interface HTMLElementEventMap {
    'cvc-cellar-bucket-deleted': CustomEvent<BucketDeletedDetail>;
    'cvc-cellar-bucket-delete-close': CustomEvent<undefined>;
  }
}
