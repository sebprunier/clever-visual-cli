import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BACKUP_PROVIDERS, VERSIONED_PROVIDERS } from '../core/addons/database.js';
import { describeError } from '../core/clever-client.js';
import { ADDON_STATE_STATUS } from '../core/home/addon-state.js';
import type { AddonStore } from '../core/home/addon-store.js';
import type { CostStore } from '../core/home/cost-store.js';
import { linkedApps } from '../core/home/grouping.js';
import type { HomeStore } from '../core/home/home-store.js';
import { readPrefs } from '../core/home/prefs.js';
import { t, type MessageKey } from '../core/i18n.js';
import {
  readListView,
  routeToHash,
  withListView,
  writeHashParams,
  type AddonTab,
  type ListView,
} from '../core/router.js';
import {
  fetchAddon,
  fetchDatabaseDetails,
  type Addon,
  type DatabaseDetails,
  type OrganisationSummary,
} from '../data/api.js';
import './addon/cvc-addon-backups.js';
import './addon/cvc-addon-env.js';
import './addon/cvc-addon-logs.js';
import './addon/cvc-addon-overview.js';
import './app/cvc-app-nav.js';
import { CvcElement } from './shared/cvc-element.js';
import { addonStateLabel } from './shared/format.js';
import { statusIcon, statusMessage } from './shared/status.js';
import { sharedStyles } from './shared/styles.js';

const TABS: ReadonlyArray<{ tab: AddonTab; label: MessageKey }> = [
  { tab: 'overview', label: 'tab.overview' },
  { tab: 'env', label: 'tab.env' },
  { tab: 'logs', label: 'tab.logs' },
  { tab: 'backups', label: 'tab.backups' },
];

/**
 * One add-on: its name and state, the overview, its exposed variables and, for
 * a dedicated plan, its logs; for a database, its details and backups; beside
 * the home list the user comes from, as an application page.
 */
@customElement('cvc-addon-page')
export class CvcAddonPage extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property({ attribute: false }) orga!: OrganisationSummary;
  @property() addonId = '';
  @property() tab: AddonTab = 'overview';
  @property({ attribute: false }) store: HomeStore | null = null;
  @property({ attribute: false }) costStore: CostStore | null = null;
  @property({ attribute: false }) addonStore: AddonStore | null = null;
  /** Bumped by the shell after an action, so the page reloads. */
  @property({ type: Number }) revision = 0;

  @state() private addon: Addon | null = null;
  /** What the provider says about a database: version, host, options. */
  @state() private details: DatabaseDetails | null = null;
  @state() private detailsError: string | null = null;
  @state() private error: string | null = null;
  @state() private filterText = '';
  @state() private groupingText = '';

  private readonly onChange = () => this.requestUpdate();

  override disconnectedCallback(): void {
    this.store?.removeEventListener('change', this.onChange);
    this.addonStore?.removeEventListener('change', this.onChange);
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    for (const key of ['store', 'addonStore'] as const) {
      if (changed.has(key)) {
        (changed.get(key) as EventTarget | null | undefined)?.removeEventListener('change', this.onChange);
        this[key]?.addEventListener('change', this.onChange);
      }
    }
    const otherOrga =
      changed.has('orga') && (changed.get('orga') as OrganisationSummary | undefined)?.id !== this.orga?.id;
    if (otherOrga || changed.has('addonId')) {
      const view = readListView();
      this.filterText = view.filter ?? '';
      this.groupingText = view.grouping ?? readPrefs(this.orga.id).grouping ?? '';
      this.addon = null;
      this.details = null;
      this.detailsError = null;
      void this.load();
    } else if (changed.has('revision')) {
      void this.load();
    }
  }

  override updated(changed: PropertyValues<this>): void {
    // Another add-on or tab starts at the top, as a new page would.
    if (changed.has('addonId') || changed.has('tab')) {
      const page = this.renderRoot.querySelector<HTMLElement>('.page');
      if (page != null) {
        page.scrollTop = 0;
      }
    }
  }

  private async load(): Promise<void> {
    if (this.client == null || this.orga == null || this.addonId === '') {
      return;
    }
    const { client, addonId } = this;
    const ownerId = this.orga.id;
    this.error = null;
    void this.addonStore?.refreshOne(client, ownerId, addonId);
    const providerId = this.orga.addons.find((addon) => addon.id === addonId)?.providerId ?? '';
    if (VERSIONED_PROVIDERS.includes(providerId) || BACKUP_PROVIDERS.includes(providerId)) {
      void this.loadDetails(client, ownerId, providerId, addonId);
    }
    try {
      const addon = await fetchAddon(client, ownerId, addonId);
      if (this.addonId === addonId) {
        this.addon = addon;
      }
    } catch (error) {
      this.error = describeError(error);
    }
  }

  private async loadDetails(client: CcApiClient, ownerId: string, providerId: string, addonId: string) {
    this.detailsError = null;
    void this.addonStore?.versions.ensureOffered(client, providerId);
    try {
      const details = await fetchDatabaseDetails(client, providerId, addonId);
      if (this.addonId === addonId) {
        this.details = details;
        // The home page's "To watch" follows what this page just read.
        this.addonStore?.versions.remember(ownerId, addonId, details.version);
      }
    } catch (error) {
      this.detailsError = describeError(error);
    }
  }

  private get view(): ListView {
    return { filter: this.filterText, grouping: this.groupingText };
  }

  private onListView(event: CustomEvent<ListView>): void {
    this.filterText = event.detail.filter;
    this.groupingText = event.detail.grouping;
    writeHashParams({ q: this.filterText.trim(), g: this.groupingText.trim() });
  }

  override render() {
    if (this.orga == null) {
      return nothing;
    }
    return html`${
        this.store != null
          ? html`<cvc-app-nav
              .orga=${this.orga}
              .client=${this.client}
              .store=${this.store}
              .costStore=${this.costStore}
              .addonStore=${this.addonStore}
              addonId=${this.addonId}
              addonTab=${this.tab}
              .filterText=${this.filterText}
              .groupingText=${this.groupingText}
              @cvc-list-view=${this.onListView}
            ></cvc-app-nav>`
          : nothing
      }
      <div class="page">${this.renderPage()}</div>`;
  }

  private renderPage() {
    const summary = this.orga.addons.find((addon) => addon.id === this.addonId);
    if (summary == null) {
      return html`<p class="empty">${t('addon.unknown')}</p>`;
    }
    const ownerId = this.orga.id;
    const state = this.addonStore?.state(ownerId, summary.id) ?? null;
    const status = state == null ? null : ADDON_STATE_STATUS[state];
    // Logs come from instances: a shared add-on has none to stream. Backups are the databases'.
    const withBackups = BACKUP_PROVIDERS.includes(summary.providerId);
    const tabs = TABS.filter(
      (entry) => (entry.tab !== 'logs' || state !== 'shared') && (entry.tab !== 'backups' || withBackups),
    );
    // Coming from the backups of a database to an add-on without any (from the list column).
    const tab = this.tab === 'backups' && !withBackups ? 'overview' : this.tab;
    const context = {
      apps: this.orga.applications.filter((app) => !app.isArchived),
      links: this.store?.get(ownerId).links ?? {},
    };
    return html`
      <header>
        <div class="row title">
          <img src=${summary.logoUrl} alt="" width="36" height="36" title=${summary.providerId} />
          <h1>${summary.name}</h1>
          ${
            state == null
              ? nothing
              : status == null
                ? html`<span class="muted small" title=${t('addonState.sharedTitle')}>${addonStateLabel(state)}</span>`
                : html`<span class="status" title=${statusMessage(status)}
                    >${statusIcon(status, 16)}<span class="sr-only">${statusMessage(status)}</span></span
                  >`
          }
        </div>
        <nav class="tabs" aria-label=${t('addon.sectionsAria')}>
          ${tabs.map(
            (entry) =>
              html`<a
                class=${entry.tab === tab ? 'active' : ''}
                aria-current=${entry.tab === tab ? 'page' : 'false'}
                href=${withListView(
                  routeToHash({ kind: 'addon', ownerId, addonId: summary.id, tab: entry.tab }),
                  this.view,
                )}
                >${t(entry.label)}</a
              >`,
          )}
        </nav>
      </header>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      <section class="content">
        ${
          tab === 'backups'
            ? html`<cvc-addon-backups
                .client=${this.client}
                ownerId=${ownerId}
                addonId=${summary.id}
                providerId=${summary.providerId}
                .details=${this.details}
              ></cvc-addon-backups>`
            : tab === 'env'
              ? html`<cvc-addon-env .client=${this.client} ownerId=${ownerId} addonId=${summary.id}></cvc-addon-env>`
              : tab === 'logs'
                ? state === 'shared'
                  ? html`<p class="empty">${t('addon.logsShared')}</p>`
                  : html`<cvc-addon-logs
                      .client=${this.client}
                      ownerId=${ownerId}
                      addonId=${summary.id}
                    ></cvc-addon-logs>`
                : html`<cvc-addon-overview
                    .client=${this.client}
                    ownerId=${ownerId}
                    .summary=${summary}
                    .addon=${this.addon}
                    .state=${state}
                    .instances=${this.addonStore?.instances(ownerId, summary.id) ?? null}
                    .linkedApps=${linkedApps(summary.id, context)}
                    .costStore=${this.costStore}
                    .details=${this.details}
                    .detailsError=${this.detailsError}
                    .offered=${this.addonStore?.versions.offered(summary.providerId) ?? null}
                  ></cvc-addon-overview>`
        }
      </section>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      /* As an application page: the page scrolls on its own beside the list column. */
      :host {
        display: flex;
        gap: 1.25rem;
        min-height: 0;
        height: 100%;
        margin-bottom: -1.25rem;
      }
      .page {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: auto;
        padding-bottom: 1.25rem;
      }
      header {
        margin-bottom: 1rem;
      }
      .title img {
        border-radius: 8px;
      }
      .title .status {
        display: inline-flex;
        align-items: center;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .tabs {
        display: flex;
        gap: 0.25rem;
        margin-top: 0.75rem;
        border-bottom: 1px solid var(--cvc-border);
        overflow-x: auto;
      }
      .tabs a {
        padding: 0.5rem 0.8rem;
        text-decoration: none;
        color: var(--cvc-muted);
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        white-space: nowrap;
      }
      .tabs a:hover {
        color: var(--cvc-text);
      }
      .tabs a.active {
        color: var(--cvc-text);
        border-bottom-color: var(--cvc-accent);
      }
      .content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .content > * {
        flex: 1;
        min-height: 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-addon-page': CvcAddonPage;
  }
}
