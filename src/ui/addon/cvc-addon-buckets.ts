import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { cellarCurl, filteredPrefix, prefixTrail, s3cmdList } from '../../core/addons/cellar.js';
import { describeError } from '../../core/clever-client.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { readHashParams, withHashParams, writeHashParams } from '../../core/router.js';
import {
  fetchCellarBucket,
  fetchCellarBuckets,
  fetchCellarObjects,
  type CellarBucket,
  type CellarBucketSummary,
  type CellarDirectory,
  type CellarObjectItem,
} from '../../data/api.js';
import '../shared/cvc-cli.js';
import { copyToClipboard } from '../shared/clipboard.js';
import { CvcElement } from '../shared/cvc-element.js';
import { openAction, pushToast } from '../shared/events.js';
import { formatBytes, formatCount, formatDateTime, formatRelative } from '../shared/format.js';
import { ICON_DOWNLOAD, ICON_REFRESH } from '../shared/icons.js';
import { sharedStyles } from '../shared/styles.js';
import { openCellarDownload } from './cellar-download.js';
import type { FolderOpenDetail } from './cvc-cellar-folder-dialog.js';
import './cvc-cellar-folder-dialog.js';
import './cvc-cellar-object-dialog.js';
import type { UploadCloseDetail } from './cvc-cellar-upload-dialog.js';
import './cvc-cellar-upload-dialog.js';

const VERSIONING_LABELS: Readonly<Record<CellarBucket['versioning'], MessageKey>> = {
  ENABLED: 'buckets.versioning.ENABLED',
  SUSPENDED: 'buckets.versioning.SUSPENDED',
  DISABLED: 'buckets.versioning.DISABLED',
};

/** The pause after the last keystroke before the filter asks the API again. */
const FILTER_DELAY = 300;
/** How long a copy button says "Copied!". */
const COPIED_FOR = 1500;

/**
 * The buckets of a Cellar add-on, then a bucket read like a file browser:
 * directories (common prefixes) first, then files, a page at a time. The open
 * bucket and directory live in the URL (`?bucket=&prefix=`), so the browser's
 * back button and a shared link work. Everything goes through the platform
 * API: no S3 credentials; a download URL is only signed when asked for, and
 * "New bucket" (#29) is the one change, through the action dialog. The
 * folder's s3cmd command copies in one click (the add-on's keys read by
 * clever-tools when it runs), the folder filters by the start of the names
 * (`?filter=`, sent as the listing's prefix), and a file opens its details,
 * with its own s3cmd command (#30). "New folder" writes nothing (S3 has only
 * key prefixes): it opens the folder, empty until a file is uploaded into it;
 * "Upload files", or files dropped on the folder, go through a dialog that
 * says what they replace before sending them (#30).
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
  /** The start of the names the open folder is listed with, as in the URL. */
  @state() private filter = '';
  /** What the filter field holds, applied after a pause. */
  @state() private filterText = '';
  /** What the copy button copied: it says "Copied!" a moment. */
  @state() private copied: string | null = null;
  /** The file whose details are open. */
  @state() private details: CellarObjectItem | null = null;
  @state() private creatingFolder = false;
  /**
   * The files chosen or dropped and where they go, fixed when the dialog opens: it stays open
   * and sends there even if the page moves to another folder meanwhile.
   */
  @state() private uploading: { files: File[]; bucket: string; folder: string } | null = null;
  /** Files dragged over the folder: it shows where they would go. */
  @state() private dropping = false;

  private filterTimer: number | undefined;
  /** The name that opened the details, focused again when they close. */
  private opener: HTMLElement | null = null;

  private readonly onHashChange = () => this.followUrl();

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
  }

  override disconnectedCallback(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    window.clearTimeout(this.filterTimer);
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
    const filter = bucket === '' ? '' : (params.get('filter') ?? '');
    if (!force && bucket === this.bucket && prefix === this.folder && filter === this.filter) {
      return;
    }
    const otherBucket = bucket !== this.bucket;
    this.bucket = bucket;
    this.folder = prefix;
    window.clearTimeout(this.filterTimer);
    this.filter = filter;
    this.filterText = filter;
    this.details = null;
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
    const { client, ownerId, realId, bucket, folder, filter } = this;
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
      const page = await fetchCellarObjects(client, ownerId, realId, bucket, filteredPrefix(folder, filter), cursor);
      // An answer for another folder, or for what the filter held before, is dropped.
      if (this.bucket !== bucket || this.folder !== folder || this.filter !== filter) {
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

  private async download(file: CellarObjectItem): Promise<void> {
    this.signing = file.key;
    this.error = null;
    try {
      await openCellarDownload(this.client, this.ownerId, this.realId, this.bucket, file.key);
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.signing = null;
    }
  }

  private onFilterInput(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    this.filterText = value;
    window.clearTimeout(this.filterTimer);
    this.filterTimer = window.setTimeout(() => this.applyFilter(value), FILTER_DELAY);
  }

  private onFilterKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.applyFilter(this.filterText);
    } else if (event.key === 'Escape' && this.filterText !== '') {
      event.preventDefault();
      event.stopPropagation();
      this.filterText = '';
      this.applyFilter('');
    }
  }

  /** Lists the open folder again with this start of the names; the URL is replaced, not pushed. */
  private applyFilter(value: string): void {
    window.clearTimeout(this.filterTimer);
    if (value === this.filter) {
      return;
    }
    this.filter = value;
    writeHashParams({ filter: value || null });
    void this.loadPage(true);
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

  private openDetails(file: CellarObjectItem, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.details = file;
  }

  private async closeDetails(): Promise<void> {
    this.details = null;
    await this.updateComplete;
    this.opener?.focus();
    this.opener = null;
  }

  /** Opens the new folder: nothing is written, it exists once a file is uploaded into it. */
  private openNewFolder(event: CustomEvent<FolderOpenDetail>): void {
    this.creatingFolder = false;
    window.location.hash = this.href(this.bucket, `${this.folder}${event.detail.name}/`);
  }

  private chooseFiles(): void {
    this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click();
  }

  private onFilesChosen(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    // Emptied so that choosing the same file again fires a change.
    input.value = '';
    if (files.length > 0) {
      this.uploading = { files, bucket: this.bucket, folder: this.folder };
    }
  }

  private static carriesFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  private onDragOver(event: DragEvent): void {
    if (this.bucket === '' || this.uploading != null || !CvcAddonBuckets.carriesFiles(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer != null) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.dropping = true;
  }

  private onDragLeave(event: DragEvent): void {
    // Leaving for a child of the drop zone is not leaving it.
    const to = event.relatedTarget as Node | null;
    if (to == null || !(event.currentTarget as HTMLElement).contains(to)) {
      this.dropping = false;
    }
  }

  private onDrop(event: DragEvent): void {
    if (!this.dropping) {
      return;
    }
    event.preventDefault();
    this.dropping = false;
    // A dropped folder comes through as an item too: only files are kept (a folder upload is out of scope).
    const files = [...(event.dataTransfer?.items ?? [])]
      .filter((item) => item.kind === 'file' && (item.webkitGetAsEntry()?.isFile ?? true))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file != null);
    if (files.length > 0) {
      this.uploading = { files, bucket: this.bucket, folder: this.folder };
    }
  }

  private closeUpload(event: CustomEvent<UploadCloseDetail>): void {
    this.uploading = null;
    const sent = event.detail.sent;
    if (sent > 0) {
      pushToast(this, { kind: 'info', message: t('cellarUpload.toast', { count: sent }) });
      void this.loadBuckets();
      if (this.bucket !== '') {
        void this.loadPage(true);
      }
    }
  }

  /** A link to a bucket and directory of this add-on, the rest of the URL kept but the filter. */
  private href(bucket: string, prefix = ''): string {
    return withHashParams(window.location.hash, { bucket: bucket || null, prefix: prefix || null, filter: null });
  }

  override render() {
    return html`
      <div class="row toolbar">
        <cvc-cli
          command=${cellarCurl(this.ownerId, this.realId, this.bucket, filteredPrefix(this.folder, this.filter))}
        ></cvc-cli>
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
      ${this.bucket === '' ? this.renderBuckets() : this.renderBrowser()} ${this.renderUpload()}
    `;
  }

  private renderUpload() {
    const upload = this.uploading;
    if (upload == null) {
      return nothing;
    }
    // The versioning is the open bucket's, read for the upload's own bucket only.
    const versioning = this.bucketInfo != null && upload.bucket === this.bucket ? this.bucketInfo.versioning : null;
    return html`<cvc-cellar-upload-dialog
      .client=${this.client}
      ownerId=${this.ownerId}
      addonId=${this.addonId}
      realId=${this.realId}
      bucket=${upload.bucket}
      folder=${upload.folder}
      .versioning=${versioning}
      .files=${upload.files}
      @cvc-cellar-upload-close=${this.closeUpload}
    ></cvc-cellar-upload-dialog>`;
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
    // Like the listing: the open folder, then the start of the names the filter holds.
    const s3cmd = s3cmdList(this.addonId, this.bucket, filteredPrefix(this.folder, this.filter));
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
        <button
          type="button"
          class="ghost small"
          title=${`${t('buckets.copyS3cmdTitle')}\n\n${s3cmd}`}
          @click=${() => this.copy(s3cmd)}
        >
          ${this.copied === s3cmd ? t('common.copied') : t('buckets.copyS3cmd')}
        </button>
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
      <div class="row filter">
        <input
          type="search"
          placeholder=${t('buckets.filter')}
          aria-label=${t('buckets.filter')}
          title=${t('buckets.filterHint')}
          .value=${this.filterText}
          @input=${this.onFilterInput}
          @keydown=${this.onFilterKeyDown}
        />
        ${this.filter === '' ? nothing : html`<span class="muted small">${t('buckets.filterHint')}</span>`}
        <span class="grow"></span>
        <button type="button" class="ghost" @click=${() => (this.creatingFolder = true)}>
          ${t('cellarFolder.open')}
        </button>
        <button type="button" @click=${this.chooseFiles}>${t('cellarUpload.choose')}</button>
        <input type="file" multiple hidden @change=${this.onFilesChosen} />
      </div>
      <div
        class="drop-zone ${this.dropping ? 'dropping' : ''}"
        @dragover=${this.onDragOver}
        @dragleave=${this.onDragLeave}
        @drop=${this.onDrop}
      >
        ${this.dropping ? html`<p class="drop-hint">${t('cellarUpload.dropHere', { folder: `${this.bucket}/${this.folder}` })}</p>` : nothing}
        ${
          !this.listed
            ? html`<p class="empty">${t('common.loading')}</p>`
            : empty
              ? html`<p class="empty">
                  ${
                    this.filter !== ''
                      ? t('buckets.noMatch', { filter: this.filter })
                      : this.folder === ''
                        ? t('buckets.empty')
                        : t('buckets.emptyFolder')
                  }
                </p>`
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
                            <td class="mono name" colspan="4">
                              <a href=${this.href(this.bucket, directory.key)}>${directory.name}/</a>
                            </td>
                          </tr>`,
                      )}
                      ${this.files.map(
                        (file) =>
                          html`<tr>
                            <td class="mono name">
                              <button
                                type="button"
                                class="link object"
                                title=${t('buckets.details', { name: file.name })}
                                @click=${(event: Event) => this.openDetails(file, event)}
                              >
                                ${file.name}
                              </button>
                            </td>
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
            ? html`<button
                type="button"
                class="more"
                ?disabled=${this.loadingMore}
                @click=${() => this.loadPage(false)}
              >
                ${this.loadingMore ? t('common.loading') : t('buckets.more')}
              </button>`
            : nothing
        }
      </div>
      ${
        this.creatingFolder
          ? html`<cvc-cellar-folder-dialog
              parent=${`${this.bucket}/${this.folder}`}
              @cvc-cellar-folder-open=${this.openNewFolder}
              @cvc-cellar-folder-close=${() => (this.creatingFolder = false)}
            ></cvc-cellar-folder-dialog>`
          : nothing
      }
      ${
        this.details == null
          ? nothing
          : html`<cvc-cellar-object-dialog
              .client=${this.client}
              ownerId=${this.ownerId}
              addonId=${this.addonId}
              realId=${this.realId}
              bucket=${this.bucket}
              .item=${this.details}
              @cvc-cellar-object-close=${this.closeDetails}
              @cvc-cellar-object-missing=${() => void this.loadPage(true)}
            ></cvc-cellar-object-dialog>`
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
      /* The file name opens its details: a link to look at, the cell's monospace kept. */
      button.object {
        font: inherit;
        text-align: left;
        overflow-wrap: anywhere;
      }
      .filter {
        margin-bottom: 0.6rem;
        gap: 0.6rem;
      }
      .filter input {
        width: min(320px, 100%);
      }
      .filter {
        flex-wrap: wrap;
      }
      /* Files dragged over the folder: the list shows where they would go. */
      .drop-zone {
        position: relative;
        border-radius: 10px;
        outline: 2px dashed transparent;
        outline-offset: 4px;
      }
      .drop-zone.dropping {
        outline-color: var(--cvc-accent);
        background: color-mix(in srgb, var(--cvc-accent) 6%, transparent);
      }
      .drop-hint {
        margin: 0 0 0.6rem;
        color: var(--cvc-accent);
        font-weight: 600;
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
