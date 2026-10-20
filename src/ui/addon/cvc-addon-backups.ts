import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { PASSWORD_VARIABLES, restoreCommand } from '../../core/addons/database.js';
import { describeError } from '../../core/clever-client.js';
import { t } from '../../core/i18n.js';
import { shellQuote } from '../../core/shell.js';
import { fetchBackups, type Backup, type DatabaseDetails } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { formatDateTime, formatRelative } from '../shared/format.js';
import { ICON_DOWNLOAD, ICON_REFRESH } from '../shared/icons.js';
import { sharedStyles } from '../shared/styles.js';

/** Download links are signed for two hours: the list is read again well before. */
const RELOAD_AFTER = 90 * 60_000;

/**
 * `clever database backups`: the backups of a database add-on, each one to
 * download, and the two commands that bring the chosen one back. Nothing is
 * restored from here: restoring writes into a database applications use.
 */
@customElement('cvc-addon-backups')
export class CvcAddonBackups extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() addonId = '';
  @property() providerId = '';
  /** Host, port, user and database for the restore command; never the password. */
  @property({ attribute: false }) details: DatabaseDetails | null = null;

  @state() private backups: Backup[] | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;
  /** The backup whose restore commands are shown. */
  @state() private picked: string | null = null;

  #reload: ReturnType<typeof setTimeout> | undefined;

  override disconnectedCallback(): void {
    clearTimeout(this.#reload);
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('addonId')) {
      this.backups = null;
      this.picked = null;
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
      const backups = await fetchBackups(client, ownerId, addonId);
      if (this.addonId === addonId) {
        this.backups = backups;
        this.#reload = setTimeout(() => void this.load(), RELOAD_AFTER);
      }
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.loading = false;
    }
  }

  override render() {
    const backups = this.backups;
    return html`
      <div class="row toolbar">
        <cvc-cli command=${`clever database backups ${this.addonId}`}></cvc-cli>
        <span class="grow"></span>
        <button type="button" class="ghost with-icon" ?disabled=${this.loading} @click=${this.load}>
          ${ICON_REFRESH} ${t('common.refresh')}
        </button>
      </div>
      <p class="muted small hint">${t('backups.hint')}</p>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        backups == null
          ? html`<p class="empty">${t('common.loading')}</p>`
          : backups.length === 0
            ? html`<p class="empty">${t('backups.none')}</p>`
            : html`<div class="card table">
                  <table>
                    <thead>
                      <tr>
                        <th>${t('backups.taken')}</th>
                        <th>${t('backups.deleted')}</th>
                        <th>${t('backups.file')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${backups.map((backup) => this.renderRow(backup))}
                    </tbody>
                  </table>
                </div>
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
      <td class="muted" title=${formatDateTime(backup.expiresAt)}>${formatRelative(backup.expiresAt)}</td>
      <td class="mono small file">${backup.filename ?? backup.backupId}</td>
      <td class="actions">
        <div class="buttons">
          <a class="button" href=${backup.downloadUrl} target="_blank" rel="noopener noreferrer"
            >${ICON_DOWNLOAD} ${t('backups.download')}</a
          >
          <button
            type="button"
            class="ghost small"
            aria-pressed=${picked}
            @click=${() => (this.picked = picked ? null : backup.backupId)}
          >
            ${t('backups.pick')}
          </button>
        </div>
      </td>
    </tr>`;
  }

  private renderRestore(backup: Backup | undefined) {
    if (backup == null) {
      return nothing;
    }
    const file = backup.filename ?? `${backup.backupId}.dump`;
    const restore = this.details == null ? null : restoreCommand(this.providerId, this.details, file);
    const password = PASSWORD_VARIABLES[this.providerId];
    return html`<section class="card restore">
      <h3>${t('backups.restoreTitle', { date: formatDateTime(backup.createdAt) })}</h3>
      <p class="step">${t('backups.restoreDownload')}</p>
      <cvc-cli
        block
        command=${`clever database backups download ${this.addonId} ${backup.backupId} --output ${shellQuote(file)}`}
      ></cvc-cli>
      ${
        restore == null
          ? nothing
          : html`<p class="step">${t('backups.restoreLoad')}</p>
              <cvc-cli block command=${restore}></cvc-cli>
              ${password ? html`<p class="muted small">${t('backups.passwordHint', { name: password })}</p>` : nothing}`
      }
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
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-addon-backups': CvcAddonBackups;
  }
}
