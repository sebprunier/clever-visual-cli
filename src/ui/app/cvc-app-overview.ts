import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CONFIG_OPTIONS } from '../../core/actions.js';
import { arrangeDomains, summarizeInstances } from '../../core/app/overview.js';
import { describeError } from '../../core/clever-client.js';
import type { CostStore } from '../../core/home/cost-store.js';
import { CONSOLE_URL } from '../../core/constants.js';
import { deploymentSource } from '../../core/deployment-source.js';
import { appStatus } from '../../core/home/status.js';
import { isInProgress } from '../../core/home/activity.js';
import { t } from '../../core/i18n.js';
import { deploymentLogsHash } from '../../core/logs/deployment-logs.js';
import { keepListView, readListView, routeToHash, type AppTab, type Route } from '../../core/router.js';
import { fetchDeployments, fetchInstances, type Application, type Deployment, type Instance } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { openAction } from '../shared/events.js';
import { ICON_EDIT } from '../shared/icons.js';
import {
  deploymentActionLabel,
  DEPLOYMENT_STATE_LABELS,
  formatDateTime,
  formatRelative,
  INSTANCE_STATE_LABELS,
  shortCommit,
  stateLabel,
} from '../shared/format.js';
import { renderCostValue } from '../shared/cost-fact.js';
import { statusIcon, statusMessage } from '../shared/status.js';
import { sharedStyles } from '../shared/styles.js';
import { domainListStyles, renderDomainRow } from './domain-row.js';

const RECENT_DEPLOYMENTS = 5;
/** Domains the overview lists; the Domains tab has them all. */
const DOMAINS_SHOWN = 5;

/**
 * The overview of an application, arranged by what one does with it: a band
 * with where it stands, then what moves or can be changed (recent activity,
 * scaling, options, domains), and aside the facts one only reads (runtime,
 * deployment, identifiers).
 */
@customElement('cvc-app-overview')
export class CvcAppOverview extends CvcElement {
  @property({ attribute: false }) app!: Application;
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  /** Bumped by the shell after an action so the activity and instances reload. */
  @property({ type: Number }) revision = 0;
  /** The organisation's costs, shared with the home page. */
  @property({ attribute: false }) costStore: CostStore | null = null;

  @state() private deployments: Deployment[] | null = null;
  @state() private instances: Instance[] | null = null;
  @state() private error: string | null = null;

  private readonly onCostsChange = () => this.requestUpdate();

  override disconnectedCallback(): void {
    this.costStore?.removeEventListener('change', this.onCostsChange);
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('costStore')) {
      (changed.get('costStore') as CostStore | null | undefined)?.removeEventListener('change', this.onCostsChange);
      this.costStore?.addEventListener('change', this.onCostsChange);
    }
    if ((changed.has('costStore') || changed.has('ownerId')) && this.costStore != null && this.client != null) {
      // Costs read once stay in this browser: complete them quietly; a first reading waits for a click.
      if (this.costStore.recentDays(this.ownerId).length > 0) {
        void this.costStore.refresh(this.client, this.ownerId);
      }
    }
    // A reloaded application (same id) keeps what is shown; another one starts afresh.
    const otherApp = changed.has('app') && (changed.get('app') as Application | undefined)?.id !== this.app?.id;
    if (otherApp) {
      this.deployments = null;
      this.instances = null;
    }
    if (otherApp || changed.has('client') || changed.has('revision')) {
      void this.load();
    }
  }

  private async load(): Promise<void> {
    if (this.client == null || this.app == null) {
      return;
    }
    const { client, ownerId } = this;
    const appId = this.app.id;
    this.error = null;
    try {
      const [deployments, instances] = await Promise.all([
        fetchDeployments(client, ownerId, appId, RECENT_DEPLOYMENTS),
        fetchInstances(client, ownerId, appId),
      ]);
      if (this.app.id === appId) {
        this.deployments = deployments;
        this.instances = instances;
      }
    } catch (error) {
      this.error = describeError(error);
    }
  }

  /** Another tab of this page, keeping the list of the column. */
  private tabHref(tab: AppTab): string {
    const route: Route = { kind: 'app', ownerId: this.ownerId, appId: this.app.id, tab };
    return keepListView(routeToHash(route), route, window.location.hash);
  }

  override render() {
    return html`
      ${this.renderBand()} ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
      <div class="columns">
        <div class="main">
          ${this.renderScaling()} ${this.renderOptionList()} ${this.renderDomains()} ${this.renderActivity()}
        </div>
        <aside class="side">${this.renderRuntime()} ${this.renderDeployment()} ${this.renderIdentifiers()}</aside>
      </div>
    `;
  }

  // --- band ----------------------------------------------------------------

  private renderBand() {
    const last = this.deployments?.[0] ?? null;
    const status = appStatus(this.app.state, last);
    // Without a favourite domain, the first custom one says more than app-<id>.cleverapps.io.
    const { primary, others, fallback } = arrangeDomains(this.app.domains);
    const main = primary ?? others[0] ?? fallback;
    return html`<section class="band card">
      <div class="fact">
        <span class="label">${t('overview.band.state')}</span>
        <span class="value status">${statusIcon(status, 16)} ${statusMessage(status)}</span>
      </div>
      <div class="fact">
        <span class="label">${t('overview.instances')}</span>
        <span class="value">${this.renderInstances()}</span>
      </div>
      <div class="fact">
        <span class="label">${t('overview.band.lastDeploy')}</span>
        <span class="value"
          >${last == null ? html`<span class="muted">${this.deployments == null ? '…' : t('common.none')}</span>` : this.describeDeployment(last)}</span
        >
      </div>
      ${this.renderCost()}
      <div class="fact">
        <span class="label">${t('overview.band.domain')}</span>
        <span class="value">
          ${
            main == null
              ? html`<span class="muted">${t('common.none')}</span>`
              : html`<a
                  class="ellipsis"
                  href="https://${main.domain}"
                  target="_blank"
                  rel="noopener"
                  title=${main.domain}
                  >${main.domain.replace(/\/$/, '')} ↗</a
                >`
          }
        </span>
      </div>
    </section>`;
  }

  /**
   * Yesterday and the last 30 days of this application, as the billing computed them (tax
   * excluded). Loading them for the first time is a deliberate click, as on the home page.
   */
  private renderCost() {
    if (this.costStore == null) {
      return nothing;
    }
    return html`<div class="fact">
      <span class="label">${t('overview.band.cost')}</span>
      <span class="value">${renderCostValue(this.costStore, this.client, this.ownerId, this.app)}</span>
    </div>`;
  }

  private renderInstances() {
    if (this.instances == null) {
      return html`<span class="muted">…</span>`;
    }
    const summary = summarizeInstances(this.instances);
    const parts = [
      ...summary.up.map((entry) => `${entry.count} × ${entry.flavor}`),
      ...summary.others.map((entry) => `${entry.count} ${stateLabel(INSTANCE_STATE_LABELS, entry.state).label}`),
      ...(summary.building ? [t('overview.building')] : []),
    ];
    return parts.length === 0 ? html`<span class="muted">${t('overview.noInstance')}</span>` : parts.join(' · ');
  }

  private describeDeployment(deployment: Deployment) {
    const status = stateLabel(DEPLOYMENT_STATE_LABELS, deployment.state);
    const who = deployment.author.name ?? deployment.cause ?? '';
    return html`<span title=${formatDateTime(deployment.date)}>${formatRelative(deployment.date)}</span> ·
      <span class="tone-${status.tone}">${status.label}</span
      >${who !== '' ? html` · <span class="muted">${who}</span>` : nothing} ·
      <a
        href=${deploymentLogsHash(this.ownerId, this.app.id, deployment.id, readListView(window.location.hash))}
        title=${t('deployments.logsTitle', { index: deployment.index })}
        >${t('watch.logs')}</a
      >`;
  }

  // --- what moves or can be changed ----------------------------------------

  private renderActivity() {
    return html`<section class="card wide">
      <h3>
        ${t('overview.activity')}
        <a class="small" href=${this.tabHref('deployments')}>${t('overview.seeAll')} →</a>
      </h3>
      <cvc-cli class="card-cli" command=${`clever activity --app ${this.app.id}`}></cvc-cli>
      ${
        this.deployments == null
          ? html`<p class="muted small">${t('common.loading')}</p>`
          : this.deployments.length === 0
            ? html`<p class="muted small">${t('deployments.none')}</p>`
            : html`<table class="activity">
                <tbody>
                  ${this.deployments.map((deployment) => this.renderDeploymentRow(deployment))}
                </tbody>
              </table>`
      }
    </section>`;
  }

  private renderDeploymentRow(deployment: Deployment) {
    const status = stateLabel(DEPLOYMENT_STATE_LABELS, deployment.state);
    const running = isInProgress(deployment);
    return html`<tr class=${running ? 'running' : ''}>
      <td class="when" title=${formatDateTime(deployment.date)}>${formatRelative(deployment.date)}</td>
      <td><span class="badge ${status.tone}">${status.label}</span></td>
      <td>${deploymentActionLabel(deployment.action) || deployment.action.toLowerCase()}</td>
      <td class="who">${deployment.author.name ?? html`<span class="muted">${deployment.cause ?? '–'}</span>`}</td>
      <td class="mono muted">${shortCommit(deployment.commit)}</td>
      <td class="actions">
        ${
          running
            ? html`<a class="small" href=${this.tabHref('logs')}>${t('tab.logs')}</a>
                <button
                  type="button"
                  class="link small danger"
                  @click=${() => openAction(this, 'cancel-deploy', { deploymentId: deployment.id })}
                >
                  ${t('deployments.cancel')}
                </button>`
            : nothing
        }
      </td>
    </tr>`;
  }

  private renderScaling() {
    const instance = this.app.instance;
    const range = (min: string | number, max: string | number) => (min === max ? `${min}` : `${min} → ${max}`);
    return html`<section class="card">
      <h3>
        ${t('overview.scaling')}
        <button type="button" class="ghost small" @click=${() => openAction(this, 'scale')}>${t('common.edit')}</button>
      </h3>
      <cvc-cli class="card-cli" command=${`clever status --app ${this.app.id}`}></cvc-cli>
      <dl>
        <dt>${t('overview.instances')}</dt>
        <dd>
          ${range(instance.minInstances, instance.maxInstances)}
          <span class="muted small">${t('overview.maxAllowed', { max: instance.maxAllowedInstances })}</span>
        </dd>
        <dt>${t('overview.size')}</dt>
        <dd>
          ${range(instance.minFlavor.name, instance.maxFlavor.name)}
          <span class="muted small">${instance.minFlavor.cpus} CPU, ${instance.minFlavor.memory.formatted}</span>
        </dd>
        <dt>${t('overview.dedicatedBuild')}</dt>
        <dd>
          ${
            this.app.hasSeparatedBuild && this.app.buildFlavor != null
              ? this.app.buildFlavor.name
              : html`<span class="muted">${t('overview.noBuild')}</span>`
          }
        </dd>
      </dl>
    </section>`;
  }

  /** Read-only, greyed checkboxes: the options change through "Edit", which shows the clever command. */
  private renderOptionList() {
    return html`<section class="card">
      <h3>
        ${t('overview.options')}
        <button type="button" class="ghost small" @click=${() => openAction(this, 'config-update')}>
          ${t('common.edit')}
        </button>
      </h3>
      <cvc-cli class="card-cli" command=${`clever config --app ${this.app.id}`}></cvc-cli>
      <ul class="plain options">
        ${CONFIG_OPTIONS.map((option) => {
          const enabled = this.app[option.field];
          return html`<li>
            <label class=${enabled ? '' : 'muted'}>
              <input type="checkbox" disabled .checked=${enabled} />
              ${t(option.label)}
            </label>
          </li>`;
        })}
      </ul>
    </section>`;
  }

  /** The first domains, the primary one on top; "See all" opens the Domains tab when there are more. */
  private renderDomains() {
    const { primary, others, fallback } = arrangeDomains(this.app.domains);
    const total = this.app.domains.length;
    const listed = [...(primary != null ? [primary] : []), ...others];
    const shown = listed.slice(0, DOMAINS_SHOWN);
    const hidden = listed.length - shown.length;
    return html`<section class="card wide">
      <h3>
        <span>${t('overview.domains')} <span class="count">${total}</span></span>
        <span class="head-actions">
          ${
            hidden > 0
              ? html`<a class="small" href=${this.tabHref('domains')}
                  >${t('overview.seeAllCount', { count: total })} →</a
                >`
              : nothing
          }
          <button type="button" class="ghost small" @click=${() => openAction(this, 'domain-add')}>
            ${t('common.add')}
          </button>
        </span>
      </h3>
      <cvc-cli class="card-cli" command=${`clever domain --app ${this.app.id}`}></cvc-cli>
      ${total === 0 ? html`<p class="muted small">${t('overview.noDomain')}</p>` : nothing}
      <ul class="domains">
        ${shown.map((entry) => renderDomainRow(this, entry))}
      </ul>
      ${
        hidden > 0
          ? html`<p class="small more">
              <a href=${this.tabHref('domains')}>${t('overview.moreDomains', { count: hidden })}</a>
            </p>`
          : nothing
      }
      ${
        fallback != null
          ? html`<div class="fallback small">
              <span class="muted">${t('overview.defaultDomain')}</span>
              <ul class="domains">
                ${renderDomainRow(this, fallback)}
              </ul>
            </div>`
          : nothing
      }
    </section>`;
  }

  // --- facts ---------------------------------------------------------------

  private renderRuntime() {
    const instance = this.app.instance;
    return html`<section class="card">
      <h3>${t('overview.runtime')}</h3>
      <dl>
        <dt>${t('overview.type')}</dt>
        <dd>${instance.variant.name} <span class="muted small">${instance.type} ${instance.version}</span></dd>
        <dt>${t('overview.zone')}</dt>
        <dd>${this.app.zone}</dd>
        <dt>${t('overview.lifetime')}</dt>
        <dd>${instance.lifetime === 'TASK' ? t('overview.task') : instance.lifetime.toLowerCase()}</dd>
        <dt>${t('overview.created')}</dt>
        <dd title=${formatDateTime(this.app.createdAt)}>${formatRelative(this.app.createdAt)}</dd>
      </dl>
    </section>`;
  }

  /** Where the code comes from (#32): GitHub deploys on a push to its branch, Clever Cloud's git on `git push clever`. */
  private renderDeployment() {
    const app = this.app;
    const source = deploymentSource(app);
    const commit = shortCommit(app.commitId);
    return html`<section class="card">
      <h3>${t('overview.deployment')}</h3>
      <dl>
        <dt>${t('overview.method')}</dt>
        <dd>
          ${
            source.kind === 'github'
              ? 'GitHub'
              : source.kind === 'clever-git'
                ? t('overview.cleverGit')
                : source.method.toLowerCase()
          }
        </dd>
        ${
          source.kind === 'github'
            ? html`<dt>${t('overview.repository')}</dt>
                <dd>
                  <a href=${source.url} target="_blank" rel="noopener noreferrer">${source.repository} ↗</a>
                </dd>`
            : nothing
        }
        ${
          source.kind === 'ftp'
            ? nothing
            : html`<dt>${source.kind === 'github' ? t('overview.githubBranch') : t('overview.branch')}</dt>
                <dd class="branch">
                  <span class="mono">${source.branch || html`<span class="muted">–</span>`}</span>
                  ${
                    /* The one thing of this card that can change: the branch a GitHub application deploys. */
                    source.kind === 'github'
                      ? html`<button
                          type="button"
                          class="edit"
                          title=${t('action.branch.title')}
                          aria-label=${t('action.branch.title')}
                          @click=${() => openAction(this, 'branch')}
                        >
                          ${ICON_EDIT}
                        </button>`
                      : nothing
                  }
                </dd>`
        }
        <dt>${t('overview.commit')}</dt>
        <dd class="mono">
          ${
            commit === ''
              ? html`<span class="muted">${t('common.none')}</span>`
              : source.kind === 'github'
                ? html`<a href="${source.url}/commit/${app.commitId}" target="_blank" rel="noopener noreferrer"
                    >${commit}</a
                  >`
                : commit
          }
        </dd>
        <dt>${t('overview.deployments')}</dt>
        <dd>
          ${app.lastDeployedAt > 0 ? t('overview.total', { count: app.lastDeployedAt }) : html`<span class="muted">${t('common.none')}</span>`}
        </dd>
      </dl>
      ${
        source.kind === 'github'
          ? html`<p class="muted small source-hint">${t('overview.githubHint')}</p>`
          : source.kind === 'clever-git' && source.remote
            ? html`<div class="remote">
                <cvc-cli command=${`git remote add clever ${source.remote}`}></cvc-cli>
                <cvc-cli command=${`git push clever HEAD:${source.branch}`}></cvc-cli>
              </div>`
            : nothing
      }
    </section>`;
  }

  private renderIdentifiers() {
    return html`<section class="card">
      <h3>${t('overview.identifiers')}</h3>
      <p class="muted small id-label">${t('overview.application')}</p>
      <cvc-cli no-prompt command=${this.app.id}></cvc-cli>
      <p class="muted small id-label">${t('overview.owner')}</p>
      <cvc-cli no-prompt command=${this.app.ownerId}></cvc-cli>
      <p class="small console">
        <a href="${CONSOLE_URL}/goto/${this.app.id}" target="_blank" rel="noopener">${t('common.openInConsole')} ↗</a>
      </p>
    </section>`;
  }

  static override styles = [
    sharedStyles,
    domainListStyles,
    css`
      :host {
        display: block;
        container-type: inline-size;
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
      .card-cli {
        display: flex;
        margin: -0.3rem 0 0.7rem;
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
      .error.small {
        margin: 0 0 0.75rem;
      }
      .ellipsis {
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: bottom;
      }

      /* The band: where the application stands, in one line of facts. */
      .band {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 0.6rem 1.25rem;
        margin-bottom: 0.75rem;
      }
      .fact {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
      }
      .fact .label {
        font-family: var(--cvc-label-font);
        font-size: 0.75rem;
        color: var(--cvc-muted);
      }
      .fact .value {
        min-width: 0;
      }
      .fact .status {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .fact button.link {
        padding: 0;
      }
      .spinner {
        display: inline-block;
        width: 0.7em;
        height: 0.7em;
        margin-left: 0.3em;
        border: 2px solid color-mix(in srgb, var(--cvc-muted) 30%, transparent);
        border-top-color: var(--cvc-accent);
        border-radius: 50%;
        vertical-align: -0.05em;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .tone-ok {
        color: var(--cvc-ok);
      }
      .tone-warn {
        color: var(--cvc-warn);
      }
      .tone-danger {
        color: var(--cvc-danger);
      }

      /* What moves or changes on the left, the facts on the right; one column when narrow. */
      .columns {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: 0.75rem;
        align-items: start;
      }
      /* Cards side by side share the height of the row. */
      .main {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        align-items: stretch;
      }
      .main .wide {
        grid-column: 1 / -1;
      }
      .side {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      @container (max-width: 860px) {
        .columns {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @container (max-width: 560px) {
        .main {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.35rem 1rem;
        margin: 0;
      }
      dt {
        font-family: var(--cvc-label-font);
        color: var(--cvc-muted);
        font-size: 0.85rem;
      }
      dd {
        margin: 0;
        min-width: 0;
      }
      ul.plain {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }

      table.activity {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      table.activity td {
        padding: 0.3rem 0.5rem 0.3rem 0;
        border-bottom: 1px solid var(--cvc-border);
        vertical-align: middle;
        white-space: nowrap;
      }
      table.activity tr:last-child td {
        border-bottom: none;
      }
      table.activity tr.running td {
        background: color-mix(in srgb, var(--cvc-warn) 8%, transparent);
      }
      table.activity .who {
        white-space: normal;
        overflow-wrap: anywhere;
      }
      table.activity .actions {
        text-align: right;
      }
      table.activity .actions > * + * {
        margin-left: 0.6rem;
      }

      .options label {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      /* Disabled boxes: grey when checked, so they read as a state, not as something to click. */
      .options input {
        margin: 0;
      }
      .head-actions {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
      }
      .more {
        margin: 0.5rem 0 0;
      }
      .fallback {
        margin: 0.75rem 0 0;
        padding-top: 0.6rem;
        border-top: 1px solid var(--cvc-border);
      }
      .fallback ul {
        margin-top: 0.3rem;
      }

      .remote {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.4rem;
        margin-top: 0.75rem;
      }
      .source-hint {
        margin-top: 0.75rem;
      }
      dd.branch {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .id-label {
        margin: 0 0 0.2rem;
      }
      .id-label:not(:first-of-type) {
        margin-top: 0.6rem;
      }
      .side cvc-cli {
        display: flex;
      }
      .console {
        margin: 0.75rem 0 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-overview': CvcAppOverview;
  }
}
