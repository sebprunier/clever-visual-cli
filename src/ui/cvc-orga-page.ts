import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { routeToHash } from '../core/router.js';
import type { ApplicationSummary, OrganisationSummary } from '../data/api.js';
import { APP_STATE_LABELS, stateLabel } from './shared/format.js';
import { sharedStyles } from './shared/styles.js';

/** Applications and add-ons of one organisation, from the summary. */
@customElement('cvc-orga-page')
export class CvcOrgaPage extends LitElement {
  @property({ attribute: false }) orga!: OrganisationSummary;

  @state() private filter = '';

  private get applications(): ApplicationSummary[] {
    const needle = this.filter.trim().toLowerCase();
    return this.orga.applications
      .filter((app) => !app.isArchived)
      .filter(
        (app) =>
          needle === '' || app.name.toLowerCase().includes(needle) || app.variantName.toLowerCase().includes(needle),
      );
  }

  override render() {
    const apps = this.applications;
    const addons = this.orga.addons;
    return html`
      <header class="row">
        <h1>${this.orga.name}</h1>
        <span class="muted small">${this.orga.applications.length} applications · ${addons.length} add-ons</span>
        <span class="cli">clever applications list</span>
        <input
          type="search"
          placeholder="Filtrer…"
          aria-label="Filtrer les applications"
          .value=${this.filter}
          @input=${(event: Event) => (this.filter = (event.currentTarget as HTMLInputElement).value)}
        />
      </header>

      <section>
        <h2>Applications</h2>
        ${
          apps.length === 0
            ? html`<p class="empty">Aucune application${this.filter ? ' pour ce filtre' : ''}.</p>`
            : html`<ul class="grid">
                ${repeat(
                  apps,
                  (app) => app.id,
                  (app) => {
                    const status = stateLabel(APP_STATE_LABELS, app.state);
                    return html`<li>
                      <a
                        class="card app"
                        href=${routeToHash({ kind: 'app', ownerId: this.orga.id, appId: app.id, tab: 'overview' })}
                      >
                        <img src=${app.variantLogoUrl} alt="" width="28" height="28" loading="lazy" />
                        <span class="name">${app.name}</span>
                        <span class="muted small">${app.variantName}</span>
                        <span class="badge ${status.tone}">${status.label}</span>
                      </a>
                    </li>`;
                  },
                )}
              </ul>`
        }
      </section>

      ${
        addons.length > 0
          ? html`<section>
              <h2>Add-ons</h2>
              <ul class="grid">
                ${repeat(
                  addons,
                  (addon) => addon.id,
                  (addon) =>
                    html`<li>
                      <div class="card app">
                        <img src=${addon.logoUrl} alt="" width="28" height="28" loading="lazy" />
                        <span class="name">${addon.name}</span>
                        <span class="muted small">${addon.providerId}</span>
                      </div>
                    </li>`,
                )}
              </ul>
            </section>`
          : nothing
      }
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      header {
        margin-bottom: 1.25rem;
      }
      header input {
        margin-left: auto;
        min-width: 220px;
      }
      section + section {
        margin-top: 1.5rem;
      }
      section h2 {
        margin-bottom: 0.6rem;
      }
      .grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 0.6rem;
      }
      .app {
        display: grid;
        grid-template-columns: auto 1fr auto;
        grid-template-areas:
          'logo name badge'
          'logo meta badge';
        column-gap: 0.75rem;
        align-items: center;
        text-decoration: none;
        padding: 0.7rem 0.9rem;
      }
      a.app:hover {
        border-color: var(--cvc-accent);
      }
      .app img {
        grid-area: logo;
        border-radius: 6px;
      }
      .app .name {
        grid-area: name;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .app .small {
        grid-area: meta;
      }
      .app .badge {
        grid-area: badge;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-orga-page': CvcOrgaPage;
  }
}
