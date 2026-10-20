/**
 * The few icons the action buttons carry, drawn in the current colour so a
 * danger button gets a danger icon. Decorative: the label says the action.
 */
import { html } from 'lit';

const ATTRS = 'fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round';

/** A circular arrow, as one turns something off and on again. */
export const ICON_RESTART = html`<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
  <path d="M20 12a8 8 0 1 1-2.35-5.65" style=${ATTRS} />
  <path d="M20 4v5h-5" style=${ATTRS} />
</svg>`;

/** Two arrows chasing each other: read again, change nothing. */
export const ICON_REFRESH = html`<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
  <path d="M4 11a8 8 0 0 1 14-4.5L20 8" style=${ATTRS} />
  <path d="M20 3v5h-5" style=${ATTRS} />
  <path d="M20 13a8 8 0 0 1-14 4.5L4 16" style=${ATTRS} />
  <path d="M4 21v-5h5" style=${ATTRS} />
</svg>`;

export const ICON_START = html`<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
  <path
    d="M7 4.5v15l12-7.5z"
    style="fill: currentColor; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round"
  />
</svg>`;

export const ICON_STOP = html`<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
  <rect x="6" y="6" width="12" height="12" rx="1.5" style="fill: currentColor" />
</svg>`;
