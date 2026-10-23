import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { t, type MessageKey } from '../core/i18n.js';
import { CvcElement } from './shared/cvc-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../core/clever-client.js';
import { indexActivity, isInProgress, type AppActivity } from '../core/home/activity.js';
import { appDocsPath } from '../core/docs.js';
import { deploymentLogsHash } from '../core/logs/deployment-logs.js';
import type { AddonStore } from '../core/home/addon-store.js';
import type { CostStore } from '../core/home/cost-store.js';
import type { HomeStore } from '../core/home/home-store.js';
import { readPrefs } from '../core/home/prefs.js';
import { appStatus } from '../core/home/status.js';
import { tagsInUse } from '../core/home/tagging.js';
import {
  readListView,
  routeToHash,
  withListView,
  writeHashParams,
  type AppTab,
  type ListView,
} from '../core/router.js';
import {
  fetchApplication,
  type Application,
  type ApplicationSummary,
  type Deployment,
  type OrganisationSummary,
} from '../data/api.js';
import './app/cvc-app-nav.js';
import './app/cvc-app-dependencies.js';
import './app/cvc-app-deployments.js';
import './app/cvc-app-domains.js';
import './app/cvc-app-env.js';
import './app/cvc-app-logs.js';
import './app/cvc-app-overview.js';
import './shared/cvc-doc-link.js';
import './shared/cvc-resource-tags.js';
import { openAction } from './shared/events.js';
import { ICON_EDIT, ICON_RESTART, ICON_START, ICON_STOP } from './shared/icons.js';
import { statusIcon, statusMessage } from './shared/status.js';
import { sharedStyles } from './shared/styles.js';

/** The tabs, in display order. The instances live in the overview; the Console keeps the rest. */
export const APP_TAB_LABELS: Record<AppTab, { label: MessageKey; cli: string }> = {
  overview: { label: 'tab.overview', cli: 'clever status' },
  logs: { label: 'tab.logs', cli: 'clever logs' },
  deployments: { label: 'tab.activity', cli: 'clever activity' },
  domains: { label: 'tab.domains', cli: 'clever domain' },
  env: { label: 'tab.env', cli: 'clever env' },
  dependencies: { label: 'tab.dependencies', cli: 'clever service' },
};

/**
 * One application: header with the main actions, tabs, and the active tab's
 * view, beside the home list the user comes from (`?q=&g=` in the URL).
 */
@customElement('cvc-app-page')
export class CvcAppPage extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';
  @property() tab: AppTab = 'overview';
  /** The Logs tab on one deployment (`?deployment=`), empty for the live logs. */
  @property() deploymentId = '';
  /** The summary entry, shown while the full application loads. */
  @property({ attribute: false }) summaryApp: ApplicationSummary | null = null;
  /** Bumped by the shell after an action so every view reloads. */
  @property({ type: Number }) revision = 0;
  /** For the list column; without them the page shows alone. */
  @property({ attribute: false }) orga: OrganisationSummary | null = null;
  @property({ attribute: false }) store: HomeStore | null = null;
  @property({ attribute: false }) costStore: CostStore | null = null;
  @property({ attribute: false }) addonStore: AddonStore | null = null;

  @state() private app: Application | null = null;
  @state() private error: string | null = null;
  @state() private filterText = '';
  @state() private groupingText = '';

  #activitySource: readonly Deployment[] | null = null;
  #activity: Map<string, AppActivity> = new Map();

  private readonly onStoreChange = () => this.requestUpdate();

  override disconnectedCallback(): void {
    this.store?.removeEventListener('change', this.onStoreChange);
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('store')) {
      (changed.get('store') as HomeStore | null | undefined)?.removeEventListener('change', this.onStoreChange);
      this.store?.addEventListener('change', this.onStoreChange);
    }
    if (changed.has('ownerId') || changed.has('appId')) {
      const view = readListView();
      this.filterText = view.filter ?? '';
      this.groupingText = view.grouping ?? readPrefs(this.ownerId).grouping ?? '';
    }
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId')) {
      this.app = null;
      void this.load();
    } else if (changed.has('revision')) {
      void this.load();
      // The deployment an action started changes the status icon of the header and of the column.
      if (this.store != null && this.orga != null) {
        const appIds = this.orga.applications.filter((app) => !app.isArchived).map((app) => app.id);
        void this.store.refresh(this.client, this.ownerId, appIds, { force: true });
      }
    }
  }

  /** The last deployment of the application, from the organisation-wide list the home store keeps. */
  private lastDeployment(): Deployment | null {
    const deployments = this.store?.get(this.ownerId).deployments ?? null;
    if (deployments !== this.#activitySource) {
      this.#activitySource = deployments;
      this.#activity = indexActivity(deployments ?? []);
    }
    return this.#activity.get(this.appId)?.last ?? null;
  }

  override updated(changed: PropertyValues<this>): void {
    // Another application or tab starts at the top, as a new page would.
    if (changed.has('appId') || changed.has('tab')) {
      const page = this.renderRoot.querySelector<HTMLElement>('.page');
      if (page != null) {
        page.scrollTop = 0;
      }
    }
  }

  private async load(): Promise<void> {
    if (this.client == null || this.appId === '') {
      return;
    }
    const { client, ownerId, appId } = this;
    this.error = null;
    try {
      const app = await fetchApplication(client, ownerId, appId);
      if (this.appId === appId) {
        this.app = app;
        this.dispatchEvent(
          new CustomEvent<Application>('cvc-app-loaded', { detail: app, bubbles: true, composed: true }),
        );
      }
    } catch (error) {
      this.error = describeError(error);
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
    return html`${
        this.orga != null && this.store != null
          ? html`<cvc-app-nav
              .orga=${this.orga}
              .client=${this.client}
              .store=${this.store}
              .costStore=${this.costStore}
              .addonStore=${this.addonStore}
              appId=${this.appId}
              tab=${this.tab}
              .filterText=${this.filterText}
              .groupingText=${this.groupingText}
              @cvc-list-view=${this.onListView}
            ></cvc-app-nav>`
          : nothing
      }
      <div class="page">${this.renderPage()}</div>`;
  }

  /** The state icon of the title; during a deployment or after a failed one, a link to its logs (#13). */
  private renderTitleStatus(icon: unknown, title: string) {
    const last = this.lastDeployment();
    if (last == null || !(isInProgress(last) || last.state === 'FAILED')) {
      return html`<span class="status" title=${title}>${icon}</span>`;
    }
    return html`<a
      class="status"
      href=${deploymentLogsHash(this.ownerId, this.appId, last.id, readListView(window.location.hash))}
      title="${title}
${t('activity.logsHint')}"
      >${icon}</a
    >`;
  }

  private renderPage() {
    const name = this.app?.name ?? this.summaryApp?.name ?? this.appId;
    const state = this.app?.state ?? this.summaryApp?.state;
    const status = state ? appStatus(state, this.lastDeployment()) : null;
    const logo = this.app?.instance.variant.logoUrl ?? this.summaryApp?.variantLogoUrl;
    const variant = this.app?.instance.variant.name ?? this.summaryApp?.variantName;
    const zone = this.app?.zone;
    const canStop = state != null && state !== 'SHOULD_BE_DOWN';
    const last = this.lastDeployment();
    const running = last != null && isInProgress(last) ? last : null;

    return html`
      <header>
        <div class="row title">
          ${logo ? html`<img src=${logo} alt="" width="36" height="36" title=${variant ?? nothing} />` : nothing}
          <h1>${name}</h1>
          <button
            type="button"
            class="edit"
            title=${t('action.rename.title')}
            aria-label=${t('action.rename.title')}
            @click=${() => openAction(this, 'rename')}
          >
            ${ICON_EDIT}
          </button>
          <cvc-doc-link
            path=${appDocsPath(this.tab, this.deploymentId !== '')}
            topic=${t('docs.topic.app')}
          ></cvc-doc-link>
          ${
            /* The overview spells out the state, runtime and zone; the title keeps the state icon for the other tabs. */
            status == null
              ? nothing
              : this.renderTitleStatus(
                  html`${statusIcon(status, 16)}<span class="sr-only">${statusMessage(status)}</span>`,
                  `${statusMessage(status)}${variant ? ` · ${variant}` : ''}${zone ? ` · ${zone}` : ''}`,
                )
          }
          <span class="grow"></span>
          ${
            /* While a deployment is queued or running, cancelling it is one click away (#33). */
            running == null
              ? nothing
              : html`<button
                  type="button"
                  class="stop"
                  @click=${() => openAction(this, 'cancel-deploy', { deploymentId: running.id })}
                >
                  ${t('app.cancelDeploy')}
                </button>`
          }
          <button type="button" class="with-icon" @click=${() => openAction(this, 'restart')}>
            ${canStop ? ICON_RESTART : ICON_START} ${canStop ? t('app.restart') : t('app.start')}
          </button>
          ${
            canStop
              ? html`<button type="button" class="with-icon stop" @click=${() => openAction(this, 'stop')}>
                  ${ICON_STOP} ${t('app.stop')}
                </button>`
              : nothing
          }
        </div>
        <cvc-resource-tags
          class="tags"
          .client=${this.client}
          ownerId=${this.ownerId}
          .resource=${
            this.summaryApp == null
              ? null
              : { id: this.summaryApp.id, kind: 'app', name: this.summaryApp.name, tags: this.summaryApp.customerTags }
          }
          .suggestions=${this.orga == null ? [] : tagsInUse([...this.orga.applications, ...this.orga.addons])}
        ></cvc-resource-tags>
        <nav class="tabs" aria-label=${t('app.sectionsAria')}>
          ${(Object.keys(APP_TAB_LABELS) as AppTab[]).map(
            (tab) =>
              html`<a
                class=${tab === this.tab ? 'active' : ''}
                aria-current=${tab === this.tab ? 'page' : 'false'}
                href=${withListView(routeToHash({ kind: 'app', ownerId: this.ownerId, appId: this.appId, tab }), this.view)}
                >${t(APP_TAB_LABELS[tab].label)}</a
              >`,
          )}
        </nav>
      </header>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      <section class="content">${this.renderTab()}</section>
    `;
  }

  private renderTab() {
    switch (this.tab) {
      case 'overview':
        return this.app == null
          ? html`<p class="empty">${t('common.loading')}</p>`
          : html`<cvc-app-overview
              .app=${this.app}
              .client=${this.client}
              ownerId=${this.ownerId}
              .revision=${this.revision}
              .costStore=${this.costStore}
            ></cvc-app-overview>`;
      case 'deployments':
        return html`<cvc-app-deployments
          .client=${this.client}
          ownerId=${this.ownerId}
          appId=${this.appId}
          .revision=${this.revision}
        ></cvc-app-deployments>`;
      case 'env':
        return html`<cvc-app-env
          .client=${this.client}
          ownerId=${this.ownerId}
          appId=${this.appId}
          .revision=${this.revision}
          .lastDeployment=${this.store?.get(this.ownerId).deployments == null ? undefined : (this.lastDeployment()?.date ?? null)}
        ></cvc-app-env>`;
      case 'logs':
        return html`<cvc-app-logs
          .client=${this.client}
          ownerId=${this.ownerId}
          appId=${this.appId}
          deploymentId=${this.deploymentId}
        ></cvc-app-logs>`;
      case 'domains':
        return this.app == null
          ? html`<p class="empty">${t('common.loading')}</p>`
          : html`<cvc-app-domains .app=${this.app}></cvc-app-domains>`;
      case 'dependencies':
        return html`<cvc-app-dependencies
          .client=${this.client}
          ownerId=${this.ownerId}
          appId=${this.appId}
          .revision=${this.revision}
          .orga=${this.orga}
          .store=${this.store}
        ></cvc-app-dependencies>`;
    }
  }

  static override styles = [
    sharedStyles,
    css`
      /* The page fills the scroll area of the shell and scrolls on its own, beside the list column;
         the negative margin takes back the bottom padding of that area so both run to the bottom. */
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
      header .tags {
        display: block;
        margin-top: 0.5rem;
      }
      .title img {
        border-radius: 8px;
      }
      /* Stopping is the disruptive one: outlined in the danger colour. */
      button.stop {
        color: var(--cvc-danger);
        border-color: color-mix(in srgb, var(--cvc-danger) 45%, var(--cvc-border));
      }
      button.stop:hover {
        background: color-mix(in srgb, var(--cvc-danger) 8%, var(--cvc-surface));
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .title .status {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--cvc-muted);
      }
      .grow {
        flex: 1;
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
    'cvc-app-page': CvcAppPage;
  }
}
