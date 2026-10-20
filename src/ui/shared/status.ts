/**
 * Icons of the application statuses, after the ones of the Clever Cloud
 * Console (`cc-header-app` in @clevercloud/components, Apache-2.0): a play
 * sign when it runs, an outlined one when it starts, both while a running
 * application redeploys, a warning triangle when the last deployment failed,
 * a square when it is stopped. The shape tells the status even without
 * colours; the colours come from the theme tokens, through the classes of
 * `statusIconStyles` (`src/ui/shared/styles.ts`): a `style` attribute would be
 * refused by the production CSP.
 */
import { html, svg } from 'lit';
import { t, type MessageKey } from '../../core/i18n.js';
import type { AppStatus } from '../../core/home/status.js';

const PLAY =
  'M19.758 11.999a1.54 1.54 0 00-.798-1.35L6.578 2.194a1.54 1.54 0 00-2.282 1.35V20.46a1.54 1.54 0 002.282 1.347L18.96 13.35a1.54 1.54 0 00.582-.566v-.002a1.53 1.53 0 00.16-.375v-.002a1.54 1.54 0 00.056-.405z';
const PLAY_OUTLINE =
  'M6.076 2.021a1.54 1.54 0 00-1.78 1.522v16.916a1.54 1.54 0 002.282 1.348l12.383-8.457a1.54 1.54 0 00.582-.567v-.002c.07-.118.122-.244.158-.375v-.002c.037-.132.056-.267.057-.404v-.002a1.54 1.54 0 00-.797-1.35L6.578 2.193a1.54 1.54 0 00-.502-.172zm.95 4.393l.064.035c.036.02 1.981 1.275 4.322 2.791l4.256 2.758-.088.059c-.147.1-8.368 5.42-8.465 5.478l-.09.055V6.414z';
const WARNING =
  'M12 2.8a1.54 1.54 0 00-1.35.798L2.191 18.98a1.54 1.54 0 001.348 2.282h16.924a1.54 1.54 0 001.348-2.282L13.35 3.598a1.54 1.54 0 00-.566-.582h-.002a1.54 1.54 0 00-.375-.16h-.002A1.539 1.539 0 0012 2.8z';
const SQUARE = 'M6 5h12a1 1 0 011 1v12a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1z';

const MESSAGES: Record<AppStatus, MessageKey> = {
  running: 'appStatus.running',
  restarting: 'appStatus.restarting',
  'restart-failed': 'appStatus.restartFailed',
  starting: 'appStatus.starting',
  'start-failed': 'appStatus.startFailed',
  stopped: 'appStatus.stopped',
  blocked: 'appStatus.blocked',
};

/** What the icon says, in a sentence, for a title or a screen reader. */
export function statusMessage(status: AppStatus): string {
  return t(MESSAGES[status]);
}

/** The icon of a status, decorative: give its meaning in text or in a title next to it. */
export function statusIcon(status: AppStatus, size = 14) {
  return html`<svg class="status-icon" viewBox="0 0 24 24" width=${size} height=${size} aria-hidden="true">
    ${statusShapes(status)}
  </svg>`;
}

/** SVG fragments: `svg`, not `html`, so the shapes land in the SVG namespace. */
function statusShapes(status: AppStatus) {
  switch (status) {
    case 'running':
      return svg`<path class="s-ok" d=${PLAY} fill="currentColor" />`;
    case 'starting':
      return svg`<path class="s-info" d=${PLAY_OUTLINE} fill="currentColor" />`;
    case 'restarting':
      return svg`<g stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path class="s-info" d="M3.213 18.537l9.69-6.66-9.69-6.664v13.326" fill="none" stroke="currentColor" />
        <path class="s-ok" d="M11.097 18.537l9.69-6.66-9.69-6.664v13.326" fill="currentColor" stroke="currentColor" />
      </g>`;
    case 'restart-failed':
      return svg`<g stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path class="s-danger" d="M12.265 17.574L6.69 6.425 1.116 17.574h11.149" fill="currentColor" stroke="currentColor" />
        <path class="s-ok" d="M13.968 18.13l8.916-6.132-8.916-6.132v12.265" fill="currentColor" stroke="currentColor" />
      </g>`;
    case 'start-failed':
      return svg`<path class="s-danger" d=${WARNING} fill="currentColor" />`;
    case 'stopped':
      return svg`<path class="s-stopped" d=${SQUARE} fill="currentColor" />`;
    case 'blocked':
      return svg`<path class="s-danger" d=${SQUARE} fill="currentColor" />`;
  }
}
