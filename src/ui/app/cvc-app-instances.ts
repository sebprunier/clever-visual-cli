import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { t } from '../../core/i18n.js';
import { CvcElement } from '../shared/cvc-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import { fetchInstances, type Instance } from '../../data/api.js';
import { formatDateTime, formatRelative, INSTANCE_STATE_LABELS, shortId, stateLabel } from '../shared/format.js';
import '../shared/cvc-cli.js';
import { sharedStyles } from '../shared/styles.js';

@customElement('cvc-app-instances')
export class CvcAppInstances extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';
  @property({ type: Number }) revision = 0;

  @state() private instances: Instance[] | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId') || changed.has('revision')) {
      void this.load();
    }
  }

  private async load(): Promise<void> {
    if (this.client == null || this.appId === '') {
      return;
    }
    const { client, ownerId, appId } = this;
    this.loading = true;
    this.error = null;
    try {
      const instances = await fetchInstances(client, ownerId, appId);
      if (this.appId === appId) {
        this.instances = instances.sort(
          (a, b) => (a.index ?? 0) - (b.index ?? 0) || a.createdAt.localeCompare(b.createdAt),
        );
      }
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.loading = false;
    }
  }

  override render() {
    return html`
      <div class="row toolbar">
        <cvc-cli command=${`clever instances --app ${this.appId}`}></cvc-cli>
        <button type="button" class="ghost" ?disabled=${this.loading} @click=${this.load}>
          ${t('common.refresh')}
        </button>
      </div>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        this.instances == null
          ? html`<p class="empty">${t('common.loading')}</p>`
          : this.instances.length === 0
            ? html`<p class="empty">${t('instances.none')}</p>`
            : html`<div class="card table">
                <table>
                  <thead>
                    <tr>
                      <th>${t('instances.instance')}</th>
                      <th>${t('common.state')}</th>
                      <th>${t('instances.size')}</th>
                      <th>${t('instances.started')}</th>
                      <th>${t('instances.deployment')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${repeat(
                      this.instances,
                      (instance) => instance.id,
                      (instance) => {
                        const status = stateLabel(INSTANCE_STATE_LABELS, instance.state);
                        return html`<tr>
                          <td>
                            ${instance.name ?? `#${instance.index ?? '?'}`}
                            ${instance.isBuildVm ? html`<span class="badge neutral">build</span>` : nothing}
                            <div class="mono small muted">${shortId(instance.id)}</div>
                          </td>
                          <td><span class="badge ${status.tone}">${status.label}</span></td>
                          <td>${instance.flavor ?? html`<span class="muted">–</span>`}</td>
                          <td title=${formatDateTime(instance.createdAt)}>${formatRelative(instance.createdAt)}</td>
                          <td class="mono small">${shortId(instance.deploymentId)}</td>
                        </tr>`;
                      },
                    )}
                  </tbody>
                </table>
              </div>`
      }
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      .toolbar {
        justify-content: space-between;
        margin-bottom: 0.75rem;
      }
      .card.table {
        padding: 0 0.5rem;
        overflow-x: auto;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-instances': CvcAppInstances;
  }
}
