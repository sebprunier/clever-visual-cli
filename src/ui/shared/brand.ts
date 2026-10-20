/**
 * The app's mark inside the app: the symbol of public/favicon.svg without its
 * night tile, drawn in the accent of the current theme (the secondary panels
 * lighter), so it sits on a light page as well as on a dark one. The browser
 * tab and the README keep the tiled icon.
 */
import { html } from 'lit';

export function appMark(height: number) {
  return html`<svg
    class="app-mark"
    viewBox="7 13 50.5 38"
    height=${height}
    width=${Math.round((height * 50.5) / 38)}
    aria-hidden="true"
  >
    <g fill="none" stroke="var(--cvc-accent)" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="10,20.5 21.5,32 10,43.5" stroke-width="5.5" />
      <path d="M20 15.5H48a7 7 0 0 1 7 7v19a7 7 0 0 1-7 7H20" stroke-width="4" />
    </g>
    <rect x="27.5" y="20" width="11" height="11" rx="2" fill="var(--cvc-accent)" />
    <g fill="var(--cvc-accent)" fill-opacity="0.55">
      <rect x="40.5" y="20" width="11" height="4" rx="2" />
      <rect x="40.5" y="26" width="11" height="4" rx="2" />
      <rect x="27.5" y="33" width="11" height="11" rx="2" />
      <rect x="40.5" y="33" width="11" height="11" rx="2" />
    </g>
  </svg>`;
}
