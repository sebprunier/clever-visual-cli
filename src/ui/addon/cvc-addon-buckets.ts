import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { cellarCurl, prefixTrail } from '../../core/addons/cellar.js';
import { describeError } from '../../core/clever-client.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { readHashParams, withHashParams } from '../../core/router.js';
import {
  fetchCellarBucket,
  fetchCellarBuckets,
  fetchCellarDownloadUrl,
  fetchCellarObjects,
  type CellarBucket,
  type CellarBucketSummary,
  type CellarDirectory,
  type CellarObjectItem,
} from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { openAction } from '../shared/events.js';
import { formatBytes, formatCount, formatDateTime, formatRelative } from '../shared/format.js';
import { ICON_DOWNLOAD, ICON_REFRESH } from '../shared/icons.js';
import { sharedStyles } from '../shared/styles.js';

const VERSIONING_LABELS: Readonly<Record<CellarBucket['versioning'], MessageKey>> = {
  ENABLED: 'buckets.versioning.ENABLED',
  SUSPENDED: 'buckets.versioning.SUSPENDED',
  DISABLED: 'buckets.versioning.DISABLED',
};

/**
 * The buckets of a Cellar add-on, then a bucket read like a file browser:
 * directories (common prefixes) first, then files, a page at a time. The open
 * bucket and directory live in the URL (`?bucket=&prefix=`), so the browser's
 * back button and a shared link work. Everything goes through the platform
 * API: no S3 credentials; a download URL is only signed when asked for, and
 * "New bucket" (#29) is the one change, through the action dialog.
 */
@customElement('cvc-addon-buckets')
export class CvcAddonBuckets extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() addonId = '';
  /** `cellar_…`: the platform routes want it. */
  @property() realId = '';
  /** Bumped by the shell after an action (a new bucket): the list reloads. */
  @property({ type: Number }) revision = 0;

  @state() private buckets: CellarBucketSummary[] | null = null;
  @state() private bucket = '';
  @state() private folder = '';
  @state() private bucketInfo: CellarBucket | null = null;
  @state() private directories: CellarDirectory[] = [];
  @state() private files: CellarObjectItem[] = [];
  /** The next page of the open directory, null once it is all listed. */
  @state() private cursor: string | null = null;
  /** Null while the open directory's first page loads. */
  @state() private listed = false;
  @state() private loadingMore = false;
  @state() private error: string | null = null;
  /** The object whose download URL is being signed. */
  @state() private signing: string | null = null;

  private readonly onHashChange = () => this.followUrl();

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
  }

  override disconnectedCallback(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('realId')) {
      this.buckets = null;
      void this.loadBuckets();
      this.followUrl(true);
    } else if (changed.has('revision')) {
      void this.loadBuckets();
    }
  }

  /** Opens what the URL names, when it differs from what is open (or always, after a change of add-on). */
  private followUrl(force = false): void {
    const params = readHashParams();
    const bucket = params.get('bucket') ?? '';
    const prefix = bucket === '' ? '' : (params.get('prefix') ?? '');
    if (!force && bucket === this.bucket && prefix === this.folder) {
      return;
    }
    const otherBucket = bucket !== this.bucket;
    this.bucket = bucket;
    this.folder = prefix;
    if (bucket === '') {
      return;
    }
    if (otherBucket || force) {
      this.bucketInfo = null;
      void this.loadBucketInfo(bucket);
    }
    void this.loadPage(true);
  }

  private async loadBuckets(): Promise<void> {
    if (this.client == null || this.realId === '') {
      return;
    }
    const { client, ownerId, realId } = this;
    this.error = null;
    try {
      const list = await fetchCellarBuckets(client, ownerId, realId);
      if (this.realId === realId) {
        this.buckets = [...list.buckets].sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (error) {
      this.error = describeError(error);
    }
  }

  private async loadBucketInfo(bucket: string): Promise<void> {
    try {
      const info = await fetchCellarBucket(this.client, this.ownerId, this.realId, bucket);
      if (this.bucket === bucket) {
        this.bucketInfo = info;
      }
    } catch {
      // Not essential: the versioning status is just not shown.
    }
  }

  /** The first page of the open directory, or the next one. */
  private async loadPage(first: boolean): Promise<void> {
    if (this.client == null || this.realId === '' || this.bucket === '') {
      return;
    }
    const { client, ownerId, realId, bucket, folder: prefix } = this;
    const cursor = first ? undefined : (this.cursor ?? undefined);
    if (first) {
      this.listed = false;
      this.directories = [];
      this.files = [];
      this.cursor = null;
    } else {
      this.loadingMore = true;
    }
    this.error = null;
    try {
      const page = await fetchCellarObjects(client, ownerId, realId, bucket, prefix, cursor);
      if (this.bucket !== bucket || this.folder !== prefix) {
        return;
      }
      this.directories = [...this.directories, ...page.directories];
      this.files = [...this.files, ...page.items];
      this.cursor = page.cursor ?? null;
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.listed = true;
      this.loadingMore = false;
    }
  }

  private refresh(): void {
    void this.loadBuckets();
    if (this.bucket !== '') {
      void this.loadBucketInfo(this.bucket);
      void this.loadPage(true);
    }
  }

  /**
   * Signs a download URL and opens it. The tab is opened before the call, while
   * the click still counts as one, or the browser would block it.
   */
  private async download(file: CellarObjectItem): Promise<void> {
    const opened = window.open('', '_blank');
    if (opened != null) {
      opened.opener = null;
    }
    this.signing = file.key;
    this.error = null;
    try {
      const url = await fetchCellarDownloadUrl(this.client, this.ownerId, this.realId, this.bucket, file.key);
      if (opened != null) {
        opened.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (error) {
      opened?.close();
      this.error = describeError(error);
    } finally {
      this.signing = null;
    }
  }

  /** A link to a bucket and directory of this add-on, the rest of the URL kept. */
  private href(bucket: string, prefix = ''): string {
    return withHashParams(window.location.hash, { bucket: bucket || null, prefix: prefix || null });
  }

  override render() {
    return html`
      <div class="row toolbar">
        <cvc-cli command=${cellarCurl(this.ownerId, this.realId, this.bucket, this.folder)}></cvc-cli>
        <span class="grow"></span>
        ${
          this.bucket === ''
            ? html`<button type="button" @click=${() => openAction(this, 'cellar-bucket-create')}>
                ${t('buckets.create')}
              </button>`
            : nothing
        }
        <button type="button" class="ghost with-icon" @click=${this.refresh}>
          ${ICON_REFRESH} ${t('common.refresh')}
        </button>
      </div>
      <p class="muted small hint">${t('buckets.hint')}</p>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${this.bucket === '' ? this.renderBuckets() : this.renderBrowser()}
    `;
  }

  private renderBuckets() {
    const buckets = this.buckets;
    if (buckets == null) {
      return html`<p class="empty">${t('common.loading')}</p>`;
    }
    if (buckets.length === 0) {
      return html`<p class="empty">${t('buckets.none')}</p>`;
    }
    return html`<div class="card table">
      <table>
        <thead>
          <tr>
            <th>${t('buckets.name')}</th>
            <th class="num">${t('buckets.objects')}</th>
            <th class="num">${t('buckets.size')}</th>
            <th>${t('buckets.updated')}</th>
          </tr>
        </thead>
        <tbody>
          ${buckets.map(
            (bucket) =>
              html`<tr>
                <td class="mono"><a href=${this.href(bucket.name)}>${bucket.name}</a></td>
                <td class="num">${formatCount(bucket.objectsCount)}</td>
                <td class="num">${formatBytes(bucket.sizeInBytes)}</td>
                <td class="muted" title=${formatDateTime(bucket.updatedAt)}>${formatRelative(bucket.updatedAt)}</td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>`;
  }

  private renderBrowser() {
    const summary = this.buckets?.find((bucket) => bucket.name === this.bucket);
    const info = this.bucketInfo;
    const empty = this.listed && this.directories.length === 0 && this.files.length === 0;
    return html`
      <nav class="row trail" aria-label=${t('buckets.trailAria')}>
        <a href=${this.href('')}>${t('buckets.all')}</a>
        <span class="sep">/</span>
        ${
          this.folder === ''
            ? html`<strong class="mono">${this.bucket}</strong>`
            : html`<a class="mono" href=${this.href(this.bucket)}>${this.bucket}</a>`
        }
        ${prefixTrail(this.folder).map(
          (step, index, trail) =>
            html`<span class="sep">/</span> ${
                index === trail.length - 1
                  ? html`<strong class="mono">${step.name}</strong>`
                  : html`<a class="mono" href=${this.href(this.bucket, step.prefix)}>${step.name}</a>`
              }`,
        )}
        <span class="grow"></span>
        ${
          summary == null
            ? nothing
            : html`<span class="muted small">
                ${t('buckets.summary', { objects: formatCount(summary.objectsCount), size: formatBytes(summary.sizeInBytes) })}
              </span>`
        }
        ${info == null ? nothing : html`<span class="badge neutral">${t(VERSIONING_LABELS[info.versioning])}</span>`}
      </nav>
      ${
        !this.listed
          ? html`<p class="empty">${t('common.loading')}</p>`
          : empty
            ? html`<p class="empty">${t('buckets.empty')}</p>`
            : html`<div class="card table">
                <table>
                  <thead>
                    <tr>
                      <th>${t('buckets.name')}</th>
                      <th class="num">${t('buckets.size')}</th>
                      <th>${t('buckets.updated')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.directories.map(
                      (directory) =>
                        html`<tr>
                          <td class="mono" colspan="4">
                            <a href=${this.href(this.bucket, directory.key)}>${directory.name}/</a>
                          </td>
                        </tr>`,
                    )}
                    ${this.files.map(
                      (file) =>
                        html`<tr>
                          <td class="mono name">${file.name}</td>
                          <td class="num">${formatBytes(file.contentLength)}</td>
                          <td class="muted" title=${formatDateTime(file.updatedAt)}>
                            ${formatRelative(file.updatedAt)}
                          </td>
                          <td class="actions">
                            <button
                              type="button"
                              class="ghost small with-icon"
                              ?disabled=${this.signing === file.key}
                              @click=${() => this.download(file)}
                            >
                              ${ICON_DOWNLOAD} ${t('buckets.download')}
                            </button>
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`
      }
      ${
        this.cursor != null && this.listed
          ? html`<button type="button" class="more" ?disabled=${this.loadingMore} @click=${() => this.loadPage(false)}>
              ${this.loadingMore ? t('common.loading') : t('buckets.more')}
            </button>`
          : nothing
      }
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      .toolbar {
        margin-bottom: 0.4rem;
        flex-wrap: nowrap;
      }
      /* The call is long: it shrinks (and ends with an ellipsis) rather than pushing the button down. */
      .toolbar cvc-cli {
        min-width: 0;
        flex: 0 1 auto;
      }
      .grow {
        flex: 1;
      }
      .hint {
        margin: 0 0 0.75rem;
      }
      .trail {
        gap: 0.35rem;
        margin-bottom: 0.6rem;
        flex-wrap: wrap;
      }
      .trail .sep {
        color: var(--cvc-muted);
      }
      .card.table {
        padding: 0 0.5rem;
        overflow-x: auto;
      }
      th.num,
      td.num {
        text-align: right;
        white-space: nowrap;
      }
      td.name {
        overflow-wrap: anywhere;
      }
      td.actions {
        width: 1%;
        white-space: nowrap;
        text-align: right;
      }
      button.small {
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
      }
      .more {
        margin-top: 0.6rem;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-addon-buckets': CvcAddonBuckets;
  }
}
