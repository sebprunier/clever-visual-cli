import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../core/clever-client.js';
import { CONSOLE_URL } from '../core/constants.js';
import { routeToHash, type AppTab } from '../core/router.js';
import { fetchApplication, type Application, type ApplicationSummary } from '../data/api.js';
import './app/cvc-app-deployments.js';
import './app/cvc-app-env.js';
import './app/cvc-app-instances.js';
import './app/cvc-app-logs.js';
import './app/cvc-app-overview.js';
import { APP_STATE_LABELS, stateLabel } from './shared/format.js';
import { sharedStyles } from './shared/styles.js';

export const APP_TAB_LABELS: Record<AppTab, { label: string; cli: string }> = {
  overview: { label: "Vue d'ensemble", cli: 'clever status' },
  instances: { label: 'Instances', cli: 'clever instances' },
  deployments: { label: 'Déploiements', cli: 'clever activity' },
  env: { label: 'Variables', cli: 'clever env' },
  logs: { label: 'Logs', cli: 'clever logs' },
};

/** One application: header, tabs, and the active tab's view. */
@customElement('cvc-app-page')
export class CvcAppPage extends LitElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';
  @property() tab: AppTab = 'overview';
  /** The summary entry, shown while the full application loads. */
  @property({ attribute: false }) summaryApp: ApplicationSummary | null = null;

  @state() private app: Application | null = null;
  @state() private error: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId')) {
      this.app = null;
      void this.load();
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
      }
    } catch (error) {
      this.error = describeError(error);
    }
  }

  override render() {
    const name = this.app?.name ?? this.summaryApp?.name ?? this.appId;
    const state = this.app?.state ?? this.summaryApp?.state;
    const status = state ? stateLabel(APP_STATE_LABELS, state) : null;
    const logo = this.app?.instance.variant.logoUrl ?? this.summaryApp?.variantLogoUrl;
    const variant = this.app?.instance.variant.name ?? this.summaryApp?.variantName;

    return html`
      <header>
        <div class="row title">
          ${logo ? html`<img src=${logo} alt="" width="36" height="36" />` : nothing}
          <h1>${name}</h1>
          ${status ? html`<span class="badge ${status.tone}">${status.label}</span>` : nothing}
          <span class="muted small">${variant ?? ''}${this.app ? ` · ${this.app.zone}` : ''}</span>
          <span class="grow"></span>
          <a class="small" href="${CONSOLE_URL}/goto/${this.appId}" target="_blank" rel="noopener">Console ↗</a>
        </div>
        <nav class="tabs" aria-label="Sections de l'application">
          ${(Object.keys(APP_TAB_LABELS) as AppTab[]).map(
            (tab) =>
              html`<a
                class=${tab === this.tab ? 'active' : ''}
                aria-current=${tab === this.tab ? 'page' : 'false'}
                href=${routeToHash({ kind: 'app', ownerId: this.ownerId, appId: this.appId, tab })}
                >${APP_TAB_LABELS[tab].label}</a
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
          ? html`<p class="empty">Chargement…</p>`
          : html`<cvc-app-overview .app=${this.app}></cvc-app-overview>`;
      case 'instances':
        return html`<cvc-app-instances
          .client=${this.client}
          ownerId=${this.ownerId}
          appId=${this.appId}
        ></cvc-app-instances>`;
      case 'deployments':
        return html`<cvc-app-deployments
          .client=${this.client}
          ownerId=${this.ownerId}
          appId=${this.appId}
        ></cvc-app-deployments>`;
      case 'env':
        return html`<cvc-app-env .client=${this.client} ownerId=${this.ownerId} appId=${this.appId}></cvc-app-env>`;
      case 'logs':
        return html`<cvc-app-logs .client=${this.client} ownerId=${this.ownerId} appId=${this.appId}></cvc-app-logs>`;
    }
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }
      header {
        margin-bottom: 1rem;
      }
      .title img {
        border-radius: 8px;
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
