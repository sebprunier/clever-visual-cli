import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { compareVersions, databaseProduct, isRetiredVersion, VERSIONED_PROVIDERS } from '../../core/addons/database.js';
import { ADDON_STATE_STATUS, type AddonState } from '../../core/home/addon-state.js';
import type { CostStore } from '../../core/home/cost-store.js';
import { appStatus } from '../../core/home/status.js';
import { CONSOLE_URL } from '../../core/constants.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { keepListView, routeToHash, type Route } from '../../core/router.js';
import type { Addon, AddonInstance, AddonSummary, ApplicationSummary, DatabaseDetails } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { renderCostValue } from '../shared/cost-fact.js';
import { CvcElement } from '../shared/cvc-element.js';
import {
  addonStateLabel,
  formatDateTime,
  formatRelative,
  formatVersionRange,
  INSTANCE_STATE_LABELS,
  stateLabel,
} from '../shared/format.js';
import { statusIcon, statusMessage } from '../shared/status.js';
import { sharedStyles } from '../shared/styles.js';

const FEATURE_LABELS: Readonly<Record<string, MessageKey>> = {
  encryption: 'database.feature.encryption',
  'direct-host-only': 'database.feature.direct-host-only',
  'do-backup': 'database.feature.do-backup',
  'skip-log-bin': 'database.feature.skip-log-bin',
};

/**
 * The overview of an add-on: a band with its state, plan, instances, cost and
 * linked applications; for a database, its version, address and options; its
 * instances (or why it has none) and the applications it serves; aside, the
 * facts and identifiers.
 */
@customElement('cvc-addon-overview')
export class CvcAddonOverview extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property({ attribute: false }) summary!: AddonSummary;
  /** The add-on in full, once read: provider, plan, zone, creation date. */
  @property({ attribute: false }) addon: Addon | null = null;
  @property({ attribute: false }) state: AddonState | null = null;
  @property({ attribute: false }) instances: AddonInstance[] | null = null;
  @property({ attribute: false }) linkedApps: ApplicationSummary[] = [];
  @property({ attribute: false }) costStore: CostStore | null = null;
  /** For a database: what its provider says about it, or why it could not be read. */
  @property({ attribute: false }) details: DatabaseDetails | null = null;
  @property({ attribute: false }) detailsError: string | null = null;
  /** The versions Clever Cloud offers for a new database of this provider. */
  @property({ attribute: false }) offered: readonly string[] | null = null;

  private appHref(appId: string): string {
    const route: Route = { kind: 'app', ownerId: this.ownerId, appId, tab: 'overview' };
    return keepListView(routeToHash(route), route, window.location.hash);
  }

  override render() {
    return html`
      ${this.renderBand()}
      <div class="columns">
        <div class="main">${this.renderDatabase()} ${this.renderInstances()} ${this.renderLinkedApps()}</div>
        <aside class="side">${this.renderFacts()} ${this.renderIdentifiers()}</aside>
      </div>
    `;
  }

  private renderBand() {
    const state = this.state;
    const status = state == null ? null : ADDON_STATE_STATUS[state];
    const live = (this.instances ?? []).filter((instance) => instance.state !== 'DELETED');
    const flavors = new Map<string, number>();
    for (const instance of live) {
      flavors.set(instance.flavor.name, (flavors.get(instance.flavor.name) ?? 0) + 1);
    }
    return html`<section class="band card">
      <div class="fact">
        <span class="label">${t('overview.band.state')}</span>
        <span class="value status">
          ${
            state == null
              ? html`<span class="muted">…</span>`
              : status == null
                ? html`<span class="muted" title=${t('addonState.sharedTitle')}>${addonStateLabel(state)}</span>`
                : html`${statusIcon(status, 16)} ${addonStateLabel(state)}`
          }
        </span>
      </div>
      <div class="fact">
        <span class="label">${t('addon.plan')}</span>
        <span class="value">${this.addon?.plan.name ?? html`<span class="muted">…</span>`}</span>
      </div>
      <div class="fact">
        <span class="label">${t('overview.instances')}</span>
        <span class="value">
          ${
            this.instances == null
              ? html`<span class="muted">…</span>`
              : live.length === 0
                ? html`<span class="muted">—</span>`
                : [...flavors].map(([flavor, count]) => `${count} × ${flavor}`).join(' · ')
          }
        </span>
      </div>
      ${
        this.costStore != null
          ? html`<div class="fact">
              <span class="label">${t('overview.band.cost')}</span>
              <span class="value">${renderCostValue(this.costStore, this.client, this.ownerId, this.summary)}</span>
            </div>`
          : nothing
      }
      <div class="fact">
        <span class="label">${t('addon.linkedApps')}</span>
        <span class="value">${this.linkedApps.length}</span>
      </div>
    </section>`;
  }

  /**
   * Version, flagged with what Clever Cloud offers instead when retired; the
   * address to copy; the options the add-on was created with, read-only.
   */
  private renderDatabase() {
    if (!VERSIONED_PROVIDERS.includes(this.summary.providerId)) {
      return nothing;
    }
    const details = this.details;
    const offered = this.offered == null ? null : [...this.offered].sort(compareVersions);
    const retired = details != null && offered != null && isRetiredVersion(details.version, offered);
    return html`<section class="card">
      <h3>${this.addon?.provider.name ?? databaseProduct(this.summary.providerId)}</h3>
      ${
        details == null
          ? this.detailsError != null
            ? html`<p class="error small" role="alert">${this.detailsError}</p>`
            : html`<p class="muted small">${t('common.loading')}</p>`
          : html`<dl>
                <dt>${t('database.version')}</dt>
                <dd class="version">
                  <span>
                    ${details.version}
                    ${retired ? html`<span class="badge warn">${t('database.retired')}</span>` : nothing}
                  </span>
                  ${
                    retired && offered != null
                      ? html`<span class="muted small">
                          ${t('database.offered', { range: formatVersionRange(offered) })}
                        </span>`
                      : nothing
                  }
                </dd>
                ${this.renderCopyFact(t('database.host'), details.host)}
                ${this.renderCopyFact(t('database.port'), details.port > 0 ? String(details.port) : '')}
                ${this.renderCopyFact(t('database.name'), details.database)}
              </dl>
              ${details.host === '' ? html`<p class="muted small">${t('database.hostInVariables')}</p>` : nothing}
              ${this.renderCreationOptions(details)}`
      }
    </section>`;
  }

  /** A value to copy; Redis has no host nor database name in its details. */
  private renderCopyFact(label: string, value: string) {
    return value === ''
      ? nothing
      : html`<dt>${label}</dt>
          <dd><cvc-cli no-prompt command=${value}></cvc-cli></dd>`;
  }

  /** The provider's features, as `clever addon create --option <name>=true` sets them. */
  private renderCreationOptions(details: DatabaseDetails) {
    if (details.features.length === 0) {
      return nothing;
    }
    const [before, after] = t('database.creationHint').split('{command}');
    return html`<div class="creation">
      <p class="sub">${t('database.creationOptions')}</p>
      <ul class="plain options">
        ${details.features.map(
          (feature) =>
            html`<li>
              <label class=${feature.enabled ? '' : 'muted'}>
                <input type="checkbox" disabled .checked=${feature.enabled} />
                ${FEATURE_LABELS[feature.name] ? t(FEATURE_LABELS[feature.name]) : feature.name}
                <code class="muted small">${feature.name}</code>
              </label>
            </li>`,
        )}
      </ul>
      <p class="muted small">${before}<code>clever addon create --option &lt;name&gt;=true</code>${after}</p>
    </div>`;
  }

  private renderInstances() {
    const live = (this.instances ?? []).filter((instance) => instance.state !== 'DELETED');
    return html`<section class="card">
      <h3>${t('overview.instances')}</h3>
      ${
        this.instances == null
          ? html`<p class="muted small">${t('common.loading')}</p>`
          : live.length === 0
            ? html`<p class="muted small">${t('addon.sharedNote')}</p>`
            : html`<table class="instances">
                <tbody>
                  ${live.map((instance) => {
                    const label = stateLabel(INSTANCE_STATE_LABELS, instance.state);
                    return html`<tr>
                      <td>${instance.displayName || `#${instance.instanceNumber}`}</td>
                      <td>
                        ${instance.flavor.name}
                        <span class="muted small"
                          >${instance.flavor.cpus} CPU, ${formatMemory(instance.flavor.mem)}</span
                        >
                      </td>
                      <td><span class="badge ${label.tone}">${label.label}</span></td>
                      <td class="muted small" title=${formatDateTime(instance.createdAt)}>
                        ${formatRelative(instance.createdAt)}
                      </td>
                    </tr>`;
                  })}
                </tbody>
              </table>`
      }
    </section>`;
  }

  private renderLinkedApps() {
    return html`<section class="card">
      <h3>${t('addon.linkedApps')} <span class="count">${this.linkedApps.length}</span></h3>
      ${
        this.linkedApps.length === 0
          ? html`<p class="muted small">${t('addon.noLinkedApp')}</p>`
          : html`<ul class="plain apps">
              ${this.linkedApps.map((app) => {
                const status = appStatus(app.state, null);
                return html`<li>
                  <img src=${app.variantLogoUrl} alt="" width="20" height="20" loading="lazy" />
                  <a href=${this.appHref(app.id)}>${app.name}</a>
                  <span class="status" title=${statusMessage(status)}>${statusIcon(status)}</span>
                </li>`;
              })}
            </ul>`
      }
      <p class="muted small note">${t('deps.dependentsHint')}</p>
    </section>`;
  }

  private renderFacts() {
    const addon = this.addon;
    return html`<section class="card">
      <h3>${t('addon.info')}</h3>
      <dl>
        <dt>${t('addon.provider')}</dt>
        <dd>${addon?.provider.name ?? this.summary.providerId}</dd>
        <dt>${t('addon.plan')}</dt>
        <dd>${addon?.plan.name ?? '…'}</dd>
        <dt>${t('overview.zone')}</dt>
        <dd>${addon?.zone ?? '…'}</dd>
        <dt>${t('overview.created')}</dt>
        <dd title=${addon ? formatDateTime(addon.createdAt) : ''}>${addon ? formatRelative(addon.createdAt) : '…'}</dd>
      </dl>
    </section>`;
  }

  private renderIdentifiers() {
    return html`<section class="card">
      <h3>${t('overview.identifiers')}</h3>
      <p class="muted small id-label">${t('addon.id')}</p>
      <cvc-cli no-prompt command=${this.summary.id}></cvc-cli>
      <p class="muted small id-label">${t('addon.realId')}</p>
      <cvc-cli no-prompt command=${this.summary.realId}></cvc-cli>
      <p class="small console">
        <a href="${CONSOLE_URL}/goto/${this.summary.id}" target="_blank" rel="noopener"
          >${t('common.openInConsole')} ↗</a
        >
      </p>
    </section>`;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        container-type: inline-size;
      }
      h3 {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0 0 0.6rem;
      }
      h3 .count {
        font-weight: 400;
        font-size: 0.85rem;
        color: var(--cvc-muted);
      }
      .band {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
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
      .columns {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: 0.75rem;
        align-items: start;
      }
      .main,
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
      table.instances {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      table.instances td {
        padding: 0.35rem 0.6rem 0.35rem 0;
        border-bottom: 1px solid var(--cvc-border);
      }
      table.instances tr:last-child td {
        border-bottom: none;
      }
      ul.plain {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      ul.apps {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      ul.apps li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      ul.apps img {
        border-radius: 4px;
      }
      ul.apps .status {
        display: inline-flex;
      }
      .note {
        margin: 0.75rem 0 0;
      }
      dd .badge {
        margin-left: 0.4rem;
      }
      dd.version {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      dd cvc-cli {
        display: flex;
      }
      .creation {
        margin-top: 0.9rem;
        padding-top: 0.6rem;
        border-top: 1px solid var(--cvc-border);
      }
      .creation .sub {
        margin: 0 0 0.4rem;
        font-family: var(--cvc-label-font);
        font-size: 0.85rem;
        color: var(--cvc-muted);
      }
      .creation p:last-child {
        margin: 0.5rem 0 0;
      }
      ul.options {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem 1.25rem;
      }
      .options code {
        font-size: 0.75rem;
      }
      .options label {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .options input {
        margin: 0;
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

/** Memory of an add-on flavor, given in megabytes. */
function formatMemory(megabytes: number): string {
  return megabytes >= 1024 ? `${Math.round((megabytes / 1024) * 10) / 10} GiB` : `${megabytes} MiB`;
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-addon-overview': CvcAddonOverview;
  }
}
