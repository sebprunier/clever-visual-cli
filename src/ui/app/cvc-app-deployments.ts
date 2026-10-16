import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import { fetchDeployments, type Deployment } from '../../data/api.js';
import {
  DEPLOYMENT_ACTION_LABELS,
  DEPLOYMENT_STATE_LABELS,
  formatDateTime,
  formatRelative,
  shortCommit,
  stateLabel,
} from '../shared/format.js';
import { sharedStyles } from '../shared/styles.js';

@customElement('cvc-app-deployments')
export class CvcAppDeployments extends LitElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';

  @state() private deployments: Deployment[] | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId')) {
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
        <span class="cli">clever activity --app ${this.appId}</span>
        <button type="button" class="ghost" ?disabled=${this.loading} @click=${this.load}>Rafraîchir</button>
      </div>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        this.deployments == null
          ? html`<p class="empty">Chargement…</p>`
          : this.deployments.length === 0
            ? html`<p class="empty">Aucun déploiement.</p>`
            : html`<div class="card table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>État</th>
                      <th>Action</th>
                      <th>Commit</th>
                      <th>Auteur</th>
                      <th>Cause</th>
                      <th>Inst.</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${repeat(
                      this.deployments,
                      (deployment) => deployment.id,
                      (deployment) => {
                        const status = stateLabel(DEPLOYMENT_STATE_LABELS, deployment.state);
                        return html`<tr>
                          <td title=${formatDateTime(deployment.date)}>
                            ${formatRelative(deployment.date)}
                            <div class="muted small">#${deployment.index}</div>
                          </td>
                          <td><span class="badge ${status.tone}">${status.label}</span></td>
                          <td>${DEPLOYMENT_ACTION_LABELS[deployment.action] || deployment.action.toLowerCase()}</td>
                          <td class="mono">${shortCommit(deployment.commit) || html`<span class="muted">–</span>`}</td>
                          <td>${deployment.author.name ?? html`<span class="muted">–</span>`}</td>
                          <td class="small">${deployment.cause ?? html`<span class="muted">–</span>`}</td>
                          <td>${deployment.instances}</td>
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
    'cvc-app-deployments': CvcAppDeployments;
  }
}
