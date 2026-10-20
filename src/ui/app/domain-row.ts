import { css, html, nothing } from 'lit';
import type { DomainEntry } from '../../core/app/overview.js';
import { t } from '../../core/i18n.js';
import { openAction } from '../shared/events.js';

/**
 * One domain of an application: its link, the "primary" badge, and its
 * actions, revealed on hover where there is one. Shared by the overview card
 * and the Domains tab; `host` is the element the action events start from.
 */
export function renderDomainRow(host: HTMLElement, entry: DomainEntry) {
  return html`<li>
    <a href="https://${entry.domain}" target="_blank" rel="noopener" title=${entry.domain}
      >${entry.domain.replace(/\/$/, '')}</a
    >
    ${entry.isPrimary ? html`<span class="badge info">${t('overview.primary')}</span>` : nothing}
    <span class="domain-actions">
      ${
        entry.isPrimary
          ? nothing
          : html`<button
              type="button"
              class="link small"
              @click=${() => openAction(host, 'domain-primary', { domain: entry.domain })}
            >
              ${t('overview.makePrimary')}
            </button>`
      }
      <button
        type="button"
        class="link small danger"
        @click=${() => openAction(host, 'domain-rm', { domain: entry.domain })}
      >
        ${t('overview.removeDomain')}
      </button>
    </span>
  </li>`;
}

export const domainListStyles = css`
  ul.domains {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  ul.domains li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  ul.domains a {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .domain-actions {
    display: inline-flex;
    gap: 0.6rem;
    margin-left: auto;
    flex: none;
  }
  .domain-actions button {
    padding: 0;
    font-size: 0.8rem;
    color: var(--cvc-muted);
  }
  .domain-actions button.danger {
    color: var(--cvc-danger);
  }
  @media (hover: hover) {
    .domain-actions {
      visibility: hidden;
    }
    ul.domains li:hover .domain-actions,
    ul.domains li:focus-within .domain-actions {
      visibility: visible;
    }
  }
`;
