/**
 * The cost of one resource for the band of its page: yesterday and the last 30
 * days, as the billing computed them (tax excluded), from the organisation's
 * cost store shared with the home page. Loading them for the first time is a
 * deliberate click, as on the home page.
 */
import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { html, nothing } from 'lit';
import { COST_DAYS, type CostStore } from '../../core/home/cost-store.js';
import { shownCost, type CostTable } from '../../core/home/costs.js';
import { t } from '../../core/i18n.js';
import { formatDay, formatMoney } from './format.js';

/** An application (`id`) or an add-on (`id` and `realId`, the one the billing uses). */
export interface CostedResource {
  id: string;
  realId?: string;
}

export function renderCostValue(store: CostStore, client: CcApiClient, ownerId: string, resource: CostedResource) {
  const data = store.get(ownerId);
  const yesterday = store.table(ownerId, 'yesterday');
  const days30 = store.table(ownerId, 'days30');
  const loading = data.loading || data.daysPending > 0;
  const progress = t('costs.daysProgress', { done: COST_DAYS - data.daysPending, total: COST_DAYS });
  if (days30 != null) {
    const amount = (table: CostTable | null) =>
      table == null ? '—' : formatMoney(shownCost(table, resource) ?? 0, table.currency);
    return html`<span
        title=${t('overview.costTitle', { from: formatDay(days30.period?.from), to: formatDay(days30.period?.to) })}
        >${t('overview.costValue', { yesterday: amount(yesterday), days30: amount(days30) })}</span
      >
      ${loading ? html`<span class="spinner" title=${progress}></span>` : nothing}`;
  }
  if (loading) {
    return html`<span class="muted"><span class="spinner"></span> ${progress}</span>`;
  }
  if (data.daysError != null) {
    return html`<span class="muted" title=${data.daysError}>${t('overview.costUnavailable')}</span>`;
  }
  return html`<button type="button" class="link" @click=${() => void store.refresh(client, ownerId)}>
    ${t('overview.costShow')}
  </button>`;
}
