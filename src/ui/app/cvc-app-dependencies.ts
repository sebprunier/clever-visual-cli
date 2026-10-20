import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../../core/clever-client.js';
import { indexActivity, type AppActivity } from '../../core/home/activity.js';
import type { HomeStore } from '../../core/home/home-store.js';
import { appStatus } from '../../core/home/status.js';
import { t } from '../../core/i18n.js';
import { keepListView, routeToHash, type Route } from '../../core/router.js';
import {
  fetchDependencies,
  type ApplicationSummary,
  type Dependencies,
  type Deployment,
  type OrganisationSummary,
} from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { openAction } from '../shared/events.js';
import { statusIcon, statusMessage } from '../shared/status.js';
import { sharedStyles } from '../shared/styles.js';

/**
 * `clever service`: the add-ons and applications this one is linked to, which
 * inject their variables into it, with link and unlink; and, from the links
 * the home page knows, the applications that depend on this one.
 */
@customElement('cvc-app-dependencies')
export class CvcAppDependencies extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';
  @property({ type: Number }) revision = 0;
  @property({ attribute: false }) orga: OrganisationSummary | null = null;
  @property({ attribute: false }) store: HomeStore | null = null;

  @state() private dependencies: Dependencies | null = null;
  @state() private error: string | null = null;

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
    if (changed.has('appId')) {
      this.dependencies = null;
    }
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId') || changed.has('revision')) {
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
      const dependencies = await fetchDependencies(client, ownerId, appId);
      if (this.appId !== appId) {
        return;
      }
      this.dependencies = dependencies;
      // The home list and the other application pages see the change without a full refresh.
      this.store?.setLinks(ownerId, appId, {
        addonIds: dependencies.addons.map((addon) => addon.id),
        applicationIds: dependencies.applications.map((app) => app.id),
      });
    } catch (error) {
      this.error = describeError(error);
    }
  }

  private lastDeployment(appId: string): Deployment | null {
    const deployments = this.store?.get(this.ownerId).deployments ?? null;
    if (deployments !== this.#activitySource) {
      this.#activitySource = deployments;
      this.#activity = indexActivity(deployments ?? []);
    }
    return this.#activity.get(appId)?.last ?? null;
  }

  private appHref(appId: string): string {
    const route: Route = { kind: 'app', ownerId: this.ownerId, appId, tab: 'overview' };
    return keepListView(routeToHash(route), route, window.location.hash);
  }

  /** The page of a linked add-on, carrying the list view as the application links do. */
  private addonHref(addonId: string): string {
    const route: Route = { kind: 'addon', ownerId: this.ownerId, addonId, tab: 'overview' };
    return keepListView(routeToHash(route), route, window.location.hash);
  }

  /** The applications whose known links point to this one. */
  private get dependents(): ApplicationSummary[] {
    if (this.orga == null || this.store == null) {
      return [];
    }
    const links = this.store.get(this.ownerId).links;
    return this.orga.applications
      .filter((app) => !app.isArchived && links[app.id]?.applicationIds.includes(this.appId))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  override render() {
    const deps = this.dependencies;
    const linksPending = (this.store?.get(this.ownerId).linksPending ?? 0) > 0;
    return html`
      <div class="row toolbar">
        <cvc-cli command=${`clever service --app ${this.appId}`}></cvc-cli>
      </div>
      <p class="muted small hint">${t('deps.hint')}</p>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      <div class="sections">
        <section class="card">
          <h3>
            <span>${t('deps.addons')} <span class="count">${deps?.addons.length ?? ''}</span></span>
            <button
              type="button"
              class="ghost small"
              ?disabled=${deps == null}
              @click=${() =>
                openAction(this, 'link-addon', { exclude: (deps?.addons ?? []).map((addon) => addon.id).join(',') })}
            >
              ${t('deps.link')}
            </button>
          </h3>
          ${
            deps == null
              ? html`<p class="muted small">${t('common.loading')}</p>`
              : deps.addons.length === 0
                ? html`<p class="muted small">${t('deps.noAddon')}</p>`
                : html`<ul class="plain items">
                    ${deps.addons.map(
                      (addon) =>
                        html`<li>
                          <img src=${addon.provider.logoUrl} alt="" width="20" height="20" loading="lazy" />
                          <a class="name" href=${this.addonHref(addon.id)}>${addon.name}</a>
                          <span class="muted small">${addon.provider.name} · ${addon.plan.name}</span>
                          <button
                            type="button"
                            class="link small danger"
                            @click=${() => openAction(this, 'unlink-addon', { addonId: addon.id })}
                          >
                            ${t('deps.unlink')}
                          </button>
                        </li>`,
                    )}
                  </ul>`
          }
        </section>

        <section class="card">
          <h3>
            <span>${t('deps.apps')} <span class="count">${deps?.applications.length ?? ''}</span></span>
            <button
              type="button"
              class="ghost small"
              ?disabled=${deps == null}
              @click=${() =>
                openAction(this, 'link-app', { exclude: (deps?.applications ?? []).map((app) => app.id).join(',') })}
            >
              ${t('deps.link')}
            </button>
          </h3>
          ${
            deps == null
              ? html`<p class="muted small">${t('common.loading')}</p>`
              : deps.applications.length === 0
                ? html`<p class="muted small">${t('deps.noApp')}</p>`
                : html`<ul class="plain items">
                    ${deps.applications.map((app) => {
                      const status = appStatus(app.state, this.lastDeployment(app.id));
                      return html`<li>
                        <img src=${app.instance.variant.logoUrl} alt="" width="20" height="20" loading="lazy" />
                        <a class="name" href=${this.appHref(app.id)}>${app.name}</a>
                        <span class="status" title=${statusMessage(status)}>${statusIcon(status)}</span>
                        <button
                          type="button"
                          class="link small danger"
                          @click=${() => openAction(this, 'unlink-app', { targetAppId: app.id })}
                        >
                          ${t('deps.unlink')}
                        </button>
                      </li>`;
                    })}
                  </ul>`
          }
        </section>

        <section class="card">
          <h3>
            <span>${t('deps.dependents')} <span class="count">${this.dependents.length}</span></span>
          </h3>
          ${this.renderDependents(linksPending)}
          <p class="muted small note">${t('deps.dependentsHint')}</p>
        </section>
      </div>
    `;
  }

  private renderDependents(linksPending: boolean) {
    const dependents = this.dependents;
    if (dependents.length === 0) {
      return html`<p class="muted small">${linksPending ? t('common.loading') : t('deps.noDependent')}</p>`;
    }
    return html`<ul class="plain items">
      ${dependents.map((app) => {
        const status = appStatus(app.state, this.lastDeployment(app.id));
        return html`<li>
          <img src=${app.variantLogoUrl} alt="" width="20" height="20" loading="lazy" />
          <a class="name" href=${this.appHref(app.id)}>${app.name}</a>
          <span class="status" title=${statusMessage(status)}>${statusIcon(status)}</span>
        </li>`;
      })}
    </ul>`;
  }

  static override styles = [
    sharedStyles,
    css`
      .toolbar {
        margin-bottom: 0.4rem;
      }
      .hint {
        margin: 0 0 0.75rem;
      }
      .sections {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 0.75rem;
        align-items: start;
      }
      h3 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin: 0 0 0.6rem;
      }
      h3 .count {
        margin-left: 0.3rem;
        font-weight: 400;
        font-size: 0.85rem;
        color: var(--cvc-muted);
      }
      button.small {
        padding: 0.15rem 0.5rem;
        font-size: 0.8rem;
      }
      button.link.small {
        padding: 0;
      }
      .danger {
        color: var(--cvc-danger);
      }
      ul.plain {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      ul.items {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      ul.items li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
      }
      ul.items img {
        flex: none;
        border-radius: 4px;
      }
      ul.items .name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ul.items li > .link {
        margin-left: auto;
        flex: none;
      }
      ul.items .status {
        display: inline-flex;
        flex: none;
      }
      ul.items li > .muted.small {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .note {
        margin: 0.75rem 0 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-dependencies': CvcAppDependencies;
  }
}
