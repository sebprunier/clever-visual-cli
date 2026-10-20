import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { backupUse, SHARED_WITHOUT_BACKUPS, SNAPSHOT_PROVIDERS, snapshotName } from '../../core/addons/database.js';
import { describeError } from '../../core/clever-client.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { shellQuote } from '../../core/shell.js';
import { fetchBackups, type Backup, type DatabaseDetails } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { formatDateTime, formatRelative } from '../shared/format.js';
import { ICON_DOWNLOAD, ICON_REFRESH } from '../shared/icons.js';
import { sharedStyles } from '../shared/styles.js';

/** Download links are signed for two hours: the list is read again well before. */
const RELOAD_AFTER = 90 * 60_000;

/** The most recent backups shown at first; some Elasticsearch add-ons keep a thousand snapshots. */
const SHOWN_FIRST = 20;

/** What to know once a backup that does not load back from here is downloaded. */
const RETRIEVE_HINTS: Readonly<Record<string, MessageKey>> = {
  'redis-addon': 'backups.redisHint',
  'mongodb-addon': 'backups.mongodbHint',
};

/**
 * `clever database backups`: the backups of a database add-on, each one to
 * download, and what to do with the chosen one: the commands that load it back
 * into PostgreSQL or MySQL, how to read a Redis archive. Elasticsearch keeps
 * snapshots instead: each one opens in Kibana and restores with the command
 * the API gives. Nothing is restored from here: restoring writes into a
 * database applications use.
 */
@customElement('cvc-addon-backups')
export class CvcAddonBackups extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() addonId = '';
  @property() providerId = '';
  /** Host, port, user and database for the restore command; never the password. */
  @property({ attribute: false }) details: DatabaseDetails | null = null;
  /** A shared plan: MySQL and MongoDB take no backup of those. */
  @property({ type: Boolean }) shared = false;

  @state() private backups: Backup[] | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;
  /** The backup whose restore commands are shown. */
  @state() private picked: string | null = null;
  /** Every backup listed, not only the most recent ones. */
  @state() private showAll = false;

  #reload: ReturnType<typeof setTimeout> | undefined;

  override disconnectedCallback(): void {
    clearTimeout(this.#reload);
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('addonId')) {
      this.backups = null;
      this.picked = null;
      this.showAll = false;
      void this.load();
    }
  }

  private async load(): Promise<void> {
    if (this.client == null || this.addonId === '') {
      return;
    }
    const { client, ownerId, addonId } = this;
    clearTimeout(this.#reload);
    this.loading = true;
    this.error = null;
    try {
      const snapshots = this.snapshots;
      const backups = await fetchBackups(client, ownerId, addonId, snapshots);
      if (this.addonId === addonId) {
        this.backups = backups;
        if (!snapshots) {
          this.#reload = setTimeout(() => void this.load(), RELOAD_AFTER);
        }
      }
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.loading = false;
    }
  }

  /** Elasticsearch: snapshots, opened in Kibana rather than downloaded. */
  private get snapshots(): boolean {
    return SNAPSHOT_PROVIDERS.includes(this.providerId);
  }

  /** Kibana links only lead somewhere when the add-on runs Kibana. */
  private get withKibana(): boolean {
    return this.details?.companions.some((companion) => companion.name === 'kibana') ?? false;
  }

  override render() {
    const backups = this.backups;
    const shown = backups == null || this.showAll ? backups : backups.slice(0, SHOWN_FIRST);
    const takesNone = this.shared && SHARED_WITHOUT_BACKUPS.includes(this.providerId);
    return html`
      <div class="row toolbar">
        <cvc-cli command=${`clever database backups ${this.addonId}`}></cvc-cli>
        <span class="grow"></span>
        <button type="button" class="ghost with-icon" ?disabled=${this.loading} @click=${this.load}>
          ${ICON_REFRESH} ${t('common.refresh')}
        </button>
      </div>
      ${takesNone ? nothing : html`<p class="muted small hint">${t(this.snapshots ? 'backups.snapshotHint' : 'backups.hint')}</p>`}
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        backups == null
          ? html`<p class="empty">
              ${t('common.loading')}
              ${this.snapshots ? html`<br /><span class="muted small">${t('backups.slowSnapshots')}</span>` : nothing}
            </p>`
          : backups.length === 0
            ? html`<p class="empty">${t(takesNone ? 'backups.noneShared' : 'backups.none')}</p>`
            : html`<div class="card table">
                  <table>
                    <thead>
                      <tr>
                        <th>${t('backups.taken')}</th>
                        <th>${t('backups.deleted')}</th>
                        <th>${t(this.snapshots ? 'backups.snapshot' : 'backups.file')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(shown ?? []).map((backup) => this.renderRow(backup))}
                    </tbody>
                  </table>
                </div>
                ${
                  backups.length > SHOWN_FIRST
                    ? html`<button
                        type="button"
                        class="link small more"
                        aria-expanded=${this.showAll}
                        @click=${() => (this.showAll = !this.showAll)}
                      >
                        ${
                          this.showAll
                            ? t('backups.showFewer')
                            : t('backups.showAll', { count: backups.length - SHOWN_FIRST })
                        }
                      </button>`
                    : nothing
                }
                ${this.renderRestore(backups.find((backup) => backup.backupId === this.picked))}`
      }
    `;
  }

  private renderRow(backup: Backup) {
    const picked = backup.backupId === this.picked;
    return html`<tr class=${picked ? 'picked' : ''}>
      <td>
        ${formatDateTime(backup.createdAt)}
        <span class="muted small">${formatRelative(backup.createdAt)}</span>
        ${backup.status === 'Done' ? nothing : html`<span class="badge neutral">${backup.status}</span>`}
      </td>
      <td class="muted" title=${formatDateTime(backup.expiresAt)}>
        ${backup.expiresAt == null ? t('backups.never') : formatRelative(backup.expiresAt)}
      </td>
      <td class="mono small file">${this.backupName(backup)}</td>
      <td class="actions">
        <div class="buttons">
          ${
            this.snapshots
              ? this.withKibana
                ? html`<a class="button" href=${backup.downloadUrl} target="_blank" rel="noopener noreferrer"
                    >${t('backups.seeInKibana')} ↗</a
                  >`
                : nothing
              : html`<a class="button" href=${backup.downloadUrl} target="_blank" rel="noopener noreferrer"
                  >${ICON_DOWNLOAD} ${t('backups.download')}</a
                >`
          }
          <button
            type="button"
            class="ghost small"
            aria-pressed=${picked}
            @click=${() => (this.picked = picked ? null : backup.backupId)}
          >
            ${t(backupUse(this.providerId, null, '').kind === 'restore' ? 'backups.pick' : 'backups.pickRetrieve')}
          </button>
        </div>
      </td>
    </tr>`;
  }

  /** The file of a database backup, the snapshot name of an Elasticsearch one. */
  private backupName(backup: Backup): string {
    return (this.snapshots ? snapshotName(backup.downloadUrl) : backup.filename) ?? backup.backupId;
  }

  private renderRestore(backup: Backup | undefined) {
    if (backup == null) {
      return nothing;
    }
    if (this.snapshots) {
      return this.renderSnapshotRestore(backup);
    }
    const file = backup.filename ?? backup.backupId;
    const use = backupUse(this.providerId, this.details, file);
    const download = `clever database backups download ${this.addonId} ${backup.backupId} --output ${shellQuote(file)}`;
    const date = formatDateTime(backup.createdAt);
    const hint = RETRIEVE_HINTS[this.providerId];
    if (use.kind === 'retrieve') {
      return html`<section class="card restore">
        <h3>${t('backups.retrieveTitle', { date })}</h3>
        <p class="step">${t(use.command == null ? 'backups.downloadOnly' : 'backups.restoreDownload')}</p>
        <cvc-cli block command=${download}></cvc-cli>
        ${
          use.command == null
            ? nothing
            : html`<p class="step">${t('backups.extract')}</p>
                <cvc-cli block command=${use.command}></cvc-cli>`
        }
        ${hint ? html`<p class="muted small">${t(hint)}</p>` : nothing}
      </section>`;
    }
    return html`<section class="card restore">
      <h3>${t('backups.restoreTitle', { date })}</h3>
      <p class="step">${t('backups.restoreDownload')}</p>
      <cvc-cli block command=${download}></cvc-cli>
      ${
        use.command == null
          ? nothing
          : html`<p class="step">${t('backups.restoreLoad')}</p>
              <cvc-cli block command=${use.command}></cvc-cli>
              ${use.password ? html`<p class="muted small">${t('backups.passwordHint', { name: use.password })}</p>` : nothing}`
      }
      <p class="muted small">${t('backups.restoreWarning')}</p>
    </section>`;
  }

  /** A snapshot restores inside the cluster: nothing to download first. */
  private renderSnapshotRestore(backup: Backup) {
    const use = backupUse(this.providerId, null, this.backupName(backup), backup.commands?.restoreCommand ?? null);
    return html`<section class="card restore">
      <h3>${t('backups.restoreTitle', { date: formatDateTime(backup.createdAt) })}</h3>
      ${
        use.command == null
          ? html`<p class="muted small">${t('backups.noRestoreCommand')}</p>`
          : html`<cvc-cli block command=${use.command}></cvc-cli>
              ${use.password ? html`<p class="muted small">${t('backups.passwordHint', { name: use.password })}</p>` : nothing}`
      }
      <p class="muted small">${t('backups.snapshotWarning')}</p>
      <p class="muted small">${t('backups.restoreWarning')}</p>
    </section>`;
  }

  static override styles = [
    sharedStyles,
    css`
      .toolbar {
        margin-bottom: 0.4rem;
      }
      .grow {
        flex: 1;
      }
      .hint {
        margin: 0 0 0.75rem;
      }
      .card.table {
        padding: 0 0.5rem;
        overflow-x: auto;
      }
      td .small {
        margin-left: 0.4rem;
      }
      td.file {
        overflow-wrap: anywhere;
      }
      td.actions {
        width: 1%;
        white-space: nowrap;
      }
      /* A link and a button side by side: same box, centred on one line. */
      .buttons {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.4rem;
      }
      tr.picked td {
        background: color-mix(in srgb, var(--cvc-accent) 8%, transparent);
      }
      /* A link that downloads, drawn as the small ghost buttons beside it. */
      a.button,
      button.small {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
        line-height: 1.4;
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
      }
      a.button {
        color: var(--cvc-text);
        text-decoration: none;
      }
      a.button:hover {
        border-color: var(--cvc-accent);
      }
      button[aria-pressed='true'] {
        border-color: var(--cvc-accent);
        color: var(--cvc-accent);
      }
      .restore {
        margin-top: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .restore h3 {
        margin: 0 0 0.2rem;
      }
      .restore p {
        margin: 0;
      }
      .restore .step {
        margin-top: 0.4rem;
      }
      .more {
        margin-top: 0.5rem;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-addon-backups': CvcAddonBackups;
  }
}
