/**
 * The app's mark inside the app: the symbol of public/favicon.svg without its
 * night tile, drawn in the accent of the current theme (the secondary panels
 * lighter), so it sits on a light page as well as on a dark one. The browser
 * tab and the README keep the tiled icon.
 */
import { html, nothing } from 'lit';
import { IS_SNAPSHOT } from '../../core/constants.js';
import { t } from '../../core/i18n.js';

export function appMark(height: number) {
  return html`<svg
    class="app-mark"
    viewBox="6.75 13.25 50.5 37.5"
    height=${height}
    width=${Math.round((height * 50.5) / 37.5)}
    aria-hidden="true"
  >
    <g fill="none" stroke="var(--cvc-accent)" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9.5,20.5 21,32 9.5,43.5" stroke-width="5.5" />
      <path d="M14.5 15.25H51.25a4 4 0 0 1 4 4v25.5a4 4 0 0 1 -4 4H14.5" stroke-width="4" />
    </g>
    <rect x="26.25" y="19.75" width="11" height="11" rx="2" fill="var(--cvc-accent)" />
    <g fill="var(--cvc-accent)" fill-opacity="0.55">
      <rect x="39.75" y="19.75" width="11" height="4.25" rx="2" />
      <rect x="39.75" y="26.5" width="11" height="4.25" rx="2" />
      <rect x="26.25" y="33.25" width="11" height="11" rx="2" />
      <rect x="39.75" y="33.25" width="11" height="11" rx="2" />
    </g>
  </svg>`;
}

/** After the name, on a build of main (#27): a "snapshot" badge, styled by `.channel` of the shared styles. */
export function channelBadge() {
  return IS_SNAPSHOT ? html`<span class="channel" title=${t('app.snapshotTitle')}>snapshot</span>` : nothing;
}
