import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { arrangeDomains, filterDomains } from '../../core/app/overview.js';
import { t } from '../../core/i18n.js';
import type { Application } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { openAction } from '../shared/events.js';
import { sharedStyles } from '../shared/styles.js';
import { domainListStyles, renderDomainRow } from './domain-row.js';

/** From this many domains on, the tab offers a filter. */
const FILTER_FROM = 6;

/**
 * Every domain of an application (`clever domain`), for the applications that
 * have many: the primary one first, the others alphabetical with a filter,
 * the default `cleverapps.io` domain apart.
 */
@customElement('cvc-app-domains')
export class CvcAppDomains extends CvcElement {
  @property({ attribute: false }) app!: Application;

  @state() private filter = '';

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('app') && (changed.get('app') as Application | undefined)?.id !== this.app?.id) {
      this.filter = '';
    }
  }

  override render() {
    const { primary, others, fallback } = arrangeDomains(this.app.domains);
    const total = this.app.domains.length;
    const filtering = this.filter.trim() !== '';
    const matches = filterDomains(
      [...(primary != null ? [primary] : []), ...others, ...(fallback != null ? [fallback] : [])],
      this.filter,
    );
    return html`
      <div class="row toolbar">
        <cvc-cli command=${`clever domain --app ${this.app.id}`}></cvc-cli>
        <span class="muted small">${t('domains.count', { count: total })}</span>
        <span class="grow"></span>
        ${
          total >= FILTER_FROM
            ? html`<input
                type="search"
                placeholder=${t('overview.filterDomains')}
                aria-label=${t('overview.filterDomains')}
                .value=${this.filter}
                @input=${(event: Event) => (this.filter = (event.currentTarget as HTMLInputElement).value)}
              />`
            : nothing
        }
        <button type="button" @click=${() => openAction(this, 'domain-add')}>${t('domains.add')}</button>
      </div>
      <section class="card">
        ${
          total === 0
            ? html`<p class="muted small">${t('overview.noDomain')}</p>`
            : filtering
              ? matches.length === 0
                ? html`<p class="muted small">${t('overview.noMatchDomain')}</p>`
                : html`<ul class="domains">
                    ${matches.map((entry) => renderDomainRow(this, entry))}
                  </ul>`
              : html`<ul class="domains">
                    ${primary != null ? renderDomainRow(this, primary) : nothing}
                    ${others.map((entry) => renderDomainRow(this, entry))}
                  </ul>
                  ${
                    fallback != null
                      ? html`<div class="fallback">
                          <p class="muted small">${t('overview.defaultDomain')}</p>
                          <ul class="domains">
                            ${renderDomainRow(this, fallback)}
                          </ul>
                        </div>`
                      : nothing
                  }`
        }
      </section>
    `;
  }

  static override styles = [
    sharedStyles,
    domainListStyles,
    css`
      .toolbar {
        margin-bottom: 0.75rem;
      }
      .toolbar input[type='search'] {
        width: 240px;
        padding: 0.3rem 0.5rem;
      }
      .grow {
        flex: 1;
      }
      ul.domains {
        gap: 0.45rem;
      }
      .fallback {
        margin-top: 0.9rem;
        padding-top: 0.6rem;
        border-top: 1px solid var(--cvc-border);
      }
      .fallback p {
        margin: 0 0 0.3rem;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-domains': CvcAppDomains;
  }
}
