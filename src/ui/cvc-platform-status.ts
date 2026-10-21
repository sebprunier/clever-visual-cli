import { css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {
  currentPlatformStatus,
  loadPlatformStatus,
  platformStatusChanges,
  STATUS_PAGE_URL,
  type PlatformIncident,
  type PlatformMaintenance,
  type PlatformStatus,
} from '../core/home/platform-status.js';
import { t } from '../core/i18n.js';
import { CvcElement } from './shared/cvc-element.js';
import { formatDateTime, formatRelative } from './shared/format.js';
import { sharedStyles } from './shared/styles.js';

const REFRESH_EVERY = 5 * 60_000;

/**
 * Card with the state of the Clever Cloud platform, read from the public
 * status page and refreshed every five minutes while displayed: incidents
 * in progress and open maintenances.
 */
@customElement('cvc-platform-status')
export class CvcPlatformStatus extends CvcElement {
  static override styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      .card {
        padding: 0.75rem 1rem;
        border-left-width: 3px;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .card.operational {
        border-left-color: var(--cvc-ok);
        background: color-mix(in srgb, var(--cvc-ok) 6%, var(--cvc-surface));
      }
      .card.incident {
        border-left-color: var(--cvc-warn);
        background: color-mix(in srgb, var(--cvc-warn) 8%, var(--cvc-surface));
      }
      .card.maintenance {
        border-left-color: var(--cvc-info);
        background: color-mix(in srgb, var(--cvc-info) 6%, var(--cvc-surface));
      }
      h2 {
        margin: 0;
        font-size: 0.95rem;
      }
      h3 {
        margin: 0.25rem 0 0;
        font-size: 0.85rem;
      }
      .headline {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
      }
      .dot {
        flex: none;
        width: 0.65rem;
        height: 0.65rem;
        border-radius: 50%;
        background: var(--cvc-muted);
      }
      .operational .dot {
        background: var(--cvc-ok);
      }
      .incident .dot {
        background: var(--cvc-warn);
      }
      .maintenance .dot {
        background: var(--cvc-info);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      li {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }
      li a {
        font-weight: 500;
        text-decoration: none;
      }
      li a:hover {
        text-decoration: underline;
      }
      .foot {
        display: flex;
        flex-wrap: wrap;
        gap: 0.2rem 0.5rem;
      }
      .foot a.quiet {
        color: inherit;
      }
      .card.compact {
        padding: 0.5rem 1rem;
      }
      .compact .headline {
        flex-wrap: wrap;
        font-size: 0.9rem;
      }
      .compact .grow {
        flex: 1;
      }
      .compact a.quiet {
        font-weight: 400;
        color: var(--cvc-muted);
      }
    `,
  ];

  @state() private status: PlatformStatus | null = currentPlatformStatus();

  #timer: ReturnType<typeof setInterval> | undefined;
  private readonly onChange = () => {
    this.status = currentPlatformStatus();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    platformStatusChanges.addEventListener('change', this.onChange);
    void loadPlatformStatus();
    this.#timer = setInterval(() => void loadPlatformStatus(), REFRESH_EVERY);
  }

  override disconnectedCallback(): void {
    clearInterval(this.#timer);
    platformStatusChanges.removeEventListener('change', this.onChange);
    super.disconnectedCallback();
  }

  override render() {
    const status = this.status;
    const state = status?.state ?? 'unknown';
    // All is well: one line, the last incident in the link's tooltip. The full card is for incidents and maintenances.
    if (status != null && status.state === 'operational' && status.active.length === 0) {
      const resolved = status.lastResolved;
      return html`<section class="card operational compact" aria-live="polite">
        <p class="headline">
          <span class="dot"></span>
          <span class="grow">${t('status.compact')}</span>
          <a
            class="quiet small"
            href=${STATUS_PAGE_URL}
            target="_blank"
            rel="noopener"
            aria-label="clevercloudstatus.com"
            title=${`clevercloudstatus.com · ${
              resolved == null
                ? t('status.noIncident')
                : t('status.lastResolved', { when: formatRelative(resolved.resolvedAt) })
            }`}
            >↗</a
          >
        </p>
      </section>`;
    }
    return html`<section class="card ${state}" aria-live="polite">
      <h2>${t('status.title')}</h2>
      <p class="headline"><span class="dot"></span>${this.headline(status)}</p>
      ${
        status != null && status.active.length > 0
          ? html`<ul>
              ${status.active.map((incident) => this.renderIncident(incident))}
            </ul>`
          : nothing
      }
      ${this.renderMaintenances(status)}
      <p class="muted small foot">
        ${this.lastResolved(status)}
        <a href=${STATUS_PAGE_URL} target="_blank" rel="noopener">clevercloudstatus.com</a>
      </p>
    </section>`;
  }

  private headline(status: PlatformStatus | null): string {
    if (status == null) {
      return t('status.loading');
    }
    switch (status.state) {
      case 'operational':
        return t('status.operational');
      case 'maintenance': {
        const count = status.maintenances.filter((maintenance) => maintenance.phase === 'in-progress').length;
        return count > 0
          ? t('status.maintenancesInProgress', { count })
          : t('status.maintenancesPlanned', { count: status.maintenances.length });
      }
      case 'incident':
        return status.active.length > 0 ? t('status.incidents', { count: status.active.length }) : status.label;
      case 'unknown':
        return t('status.unknown');
    }
  }

  private renderIncident(incident: PlatformIncident) {
    const detail = [t('status.since', { when: formatRelative(incident.occurredAt) }), ...incident.components];
    return html`<li>
      <a href=${incident.url} target="_blank" rel="noopener">${incident.name}</a>
      <span class="muted small">${detail.join(' · ')}</span>
    </li>`;
  }

  /** Under the incidents with a heading of their own; without incident, the headline says enough. */
  private renderMaintenances(status: PlatformStatus | null) {
    if (status == null || status.maintenances.length === 0) {
      return nothing;
    }
    return html`${status.state === 'maintenance' ? nothing : html`<h3>${t('status.maintenances')}</h3>`}
      <ul>
        ${status.maintenances.map((maintenance) => this.renderMaintenance(maintenance))}
      </ul>`;
  }

  private renderMaintenance(maintenance: PlatformMaintenance) {
    const phase =
      maintenance.phase === 'in-progress'
        ? t('status.maintenance.inProgress')
        : maintenance.phase === 'delayed'
          ? t('status.maintenance.delayed')
          : t('status.maintenance.planned', { when: formatDateTime(maintenance.scheduledAt) });
    const detail = [phase, ...maintenance.components, ...maintenance.regions];
    return html`<li>
      <a href=${maintenance.url} target="_blank" rel="noopener">${maintenance.name}</a>
      <span
        class="muted small"
        title=${maintenance.phase === 'planned' ? formatRelative(maintenance.scheduledAt) : nothing}
        >${detail.join(' · ')}</span
      >
    </li>`;
  }

  private lastResolved(status: PlatformStatus | null) {
    if (status == null || status.state === 'unknown') {
      return nothing;
    }
    const incident = status.lastResolved;
    if (incident == null) {
      return html`<span>${t('status.noIncident')} ·</span>`;
    }
    return html`<a class="quiet" href=${incident.url} target="_blank" rel="noopener" title=${incident.name}
        >${t('status.lastResolved', { when: formatRelative(incident.resolvedAt) })}</a
      >
      <span>·</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-platform-status': CvcPlatformStatus;
  }
}
