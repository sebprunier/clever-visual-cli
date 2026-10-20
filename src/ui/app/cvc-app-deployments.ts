import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { t } from '../../core/i18n.js';
import { CvcElement } from '../shared/cvc-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import { fetchDeployments, type Deployment } from '../../data/api.js';
import { openAction } from '../shared/events.js';
import {
  deploymentActionLabel,
  DEPLOYMENT_STATE_LABELS,
  formatDateTime,
  formatRelative,
  shortCommit,
  stateLabel,
} from '../shared/format.js';
import '../shared/cvc-cli.js';
import { sharedStyles } from '../shared/styles.js';

@customElement('cvc-app-deployments')
export class CvcAppDeployments extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';
  @property({ type: Number }) revision = 0;

  @state() private deployments: Deployment[] | null = null;
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
      const deployments = await fetchDeployments(client, ownerId, appId, 30);
      if (this.appId === appId) {
        this.deployments = deployments;
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
        <cvc-cli command=${`clever activity --app ${this.appId}`}></cvc-cli>
        <button type="button" class="ghost" ?disabled=${this.loading} @click=${this.load}>
          ${t('common.refresh')}
        </button>
      </div>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        this.deployments == null
          ? html`<p class="empty">${t('common.loading')}</p>`
          : this.deployments.length === 0
            ? html`<p class="empty">${t('deployments.none')}</p>`
            : html`<div class="card table">
                <table>
                  <thead>
                    <tr>
                      <th>${t('common.date')}</th>
                      <th>${t('common.state')}</th>
                      <th>${t('deployments.action')}</th>
                      <th>${t('deployments.commit')}</th>
                      <th>${t('deployments.author')}</th>
                      <th>${t('deployments.cause')}</th>
                      <th>${t('deployments.instances')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${repeat(
                      this.deployments,
                      (deployment) => deployment.id,
                      (deployment) => {
                        const status = stateLabel(DEPLOYMENT_STATE_LABELS, deployment.state);
                        const inProgress =
                          deployment.state === 'WORK_IN_PROGRESS' || deployment.state === 'TASK_IN_PROGRESS';
                        return html`<tr>
                          <td title=${formatDateTime(deployment.date)}>
                            ${formatRelative(deployment.date)}
                            <div class="muted small">#${deployment.index}</div>
                          </td>
                          <td><span class="badge ${status.tone}">${status.label}</span></td>
                          <td>${deploymentActionLabel(deployment.action) || deployment.action.toLowerCase()}</td>
                          <td class="mono">${shortCommit(deployment.commit) || html`<span class="muted">–</span>`}</td>
                          <td>${deployment.author.name ?? html`<span class="muted">–</span>`}</td>
                          <td class="small">${deployment.cause ?? html`<span class="muted">–</span>`}</td>
                          <td>${deployment.instances}</td>
                          <td class="actions">
                            ${
                              inProgress
                                ? html`<button
                                    type="button"
                                    class="ghost small danger"
                                    @click=${() => openAction(this, 'cancel-deploy', { deploymentId: deployment.id })}
                                  >
                                    ${t('deployments.cancel')}
                                  </button>`
                                : nothing
                            }
                          </td>
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
      td.actions {
        text-align: right;
        white-space: nowrap;
      }
      button.small {
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
      }
      button.danger {
        color: var(--cvc-danger);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-deployments': CvcAppDeployments;
  }
}
