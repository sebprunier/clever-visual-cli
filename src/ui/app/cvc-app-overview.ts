import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { CONSOLE_URL } from '../../core/constants.js';
import type { Application } from '../../data/api.js';
import { formatDateTime, formatRelative, shortCommit } from '../shared/format.js';
import { sharedStyles } from '../shared/styles.js';

/** Static facts about an application, the `clever status` and `clever config` view in one screen. */
@customElement('cvc-app-overview')
export class CvcAppOverview extends LitElement {
  @property({ attribute: false }) app!: Application;

  override render() {
    const app = this.app;
    const instance = app.instance;
    const flavorRange =
      instance.minFlavor.name === instance.maxFlavor.name
        ? instance.minFlavor.name
        : `${instance.minFlavor.name} → ${instance.maxFlavor.name}`;
    const instanceRange =
      instance.minInstances === instance.maxInstances
        ? `${instance.minInstances}`
        : `${instance.minInstances} → ${instance.maxInstances}`;

    return html`
      <div class="grid">
        <section class="card">
          <h3>Runtime</h3>
          <dl>
            <dt>Type</dt>
            <dd>${instance.variant.name} <span class="muted">(${instance.type} ${instance.version})</span></dd>
            <dt>Zone</dt>
            <dd>${app.zone}</dd>
            <dt>Cycle de vie</dt>
            <dd>${instance.lifetime === 'TASK' ? 'tâche ponctuelle' : instance.lifetime.toLowerCase()}</dd>
            <dt>Créée</dt>
            <dd title=${formatDateTime(app.createdAt)}>${formatRelative(app.createdAt)}</dd>
          </dl>
        </section>

        <section class="card">
          <h3>Scaling <span class="cli">clever scale</span></h3>
          <dl>
            <dt>Instances</dt>
            <dd>${instanceRange} <span class="muted">(max autorisé : ${instance.maxAllowedInstances})</span></dd>
            <dt>Taille</dt>
            <dd>
              ${flavorRange}
              <span class="muted">· ${instance.minFlavor.cpus} CPU, ${instance.minFlavor.memory.formatted}</span>
            </dd>
            ${
              app.buildFlavor
                ? html`<dt>Build dédié</dt>
                    <dd>${app.buildFlavor.name}</dd>`
                : nothing
            }
          </dl>
        </section>

        <section class="card">
          <h3>Déploiement <span class="cli">clever status</span></h3>
          <dl>
            <dt>Méthode</dt>
            <dd>${app.deployment.type.toLowerCase()}</dd>
            <dt>Branche</dt>
            <dd>${app.branch || html`<span class="muted">–</span>`}</dd>
            <dt>Commit</dt>
            <dd class="mono">${shortCommit(app.commitId) || html`<span class="muted">aucun</span>`}</dd>
            <dt>Dernier déploiement</dt>
            <dd title=${formatDateTime(app.lastDeployedAt)}>
              ${formatRelative(app.lastDeployedAt) || html`<span class="muted">jamais</span>`}
            </dd>
            <dt>Remote</dt>
            <dd class="mono small wrap">${app.deployment.httpUrl ?? app.deployment.url}</dd>
          </dl>
        </section>

        <section class="card">
          <h3>Domaines <span class="cli">clever domain</span></h3>
          ${
            app.domains.length === 0
              ? html`<p class="muted">Aucun domaine.</p>`
              : html`<ul class="plain">
                  ${app.domains.map(
                    (domain) =>
                      html`<li>
                        <a href="https://${domain.domain}" target="_blank" rel="noopener">${domain.domain}</a>
                        ${domain.isPrimary ? html`<span class="badge info">principal</span>` : nothing}
                      </li>`,
                  )}
                </ul>`
          }
        </section>

        <section class="card">
          <h3>Options <span class="cli">clever config</span></h3>
          <ul class="plain">
            ${option('Sessions persistantes', app.hasStickySessions)}
            ${option('Déploiement sans interruption', app.isZeroDowntimeDeploymentEnabled)}
            ${option('HTTPS forcé', app.shouldForceHttps)} ${option('Build séparé', app.hasSeparatedBuild)}
            ${option('Annuler le déploiement en cours au push', app.cancelOnPush)}
          </ul>
        </section>

        <section class="card">
          <h3>Identifiants</h3>
          <dl>
            <dt>Application</dt>
            <dd class="mono small">${app.id}</dd>
            <dt>Propriétaire</dt>
            <dd class="mono small">${app.ownerId}</dd>
          </dl>
          <p class="small">
            <a href="${CONSOLE_URL}/goto/${app.id}" target="_blank" rel="noopener">Ouvrir dans la Console</a>
          </p>
        </section>
      </div>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 0.75rem;
      }
      h3 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.6rem;
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.35rem 1rem;
        margin: 0;
      }
      dt {
        color: var(--cvc-muted);
        font-size: 0.85rem;
      }
      dd {
        margin: 0;
        min-width: 0;
      }
      .wrap {
        overflow-wrap: anywhere;
      }
      ul.plain {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      ul.plain li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .off {
        color: var(--cvc-muted);
      }
      section p.small {
        margin-top: 0.75rem;
      }
    `,
  ];
}

function option(label: string, enabled: boolean) {
  return html`<li class=${enabled ? '' : 'off'}><span aria-hidden="true">${enabled ? '●' : '○'}</span> ${label}</li>`;
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-overview': CvcAppOverview;
  }
}
