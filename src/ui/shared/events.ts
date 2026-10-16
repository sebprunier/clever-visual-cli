import type { ActionValues } from '../../core/actions.js';
import type { Toast } from '../cvc-toaster.js';

export interface OpenActionDetail {
  actionId: string;
  prefill: ActionValues;
}

/** Asks the shell to open the action dialog for `actionId`, from anywhere in the tree. */
export function openAction(host: HTMLElement, actionId: string, prefill: ActionValues = {}): void {
  host.dispatchEvent(
    new CustomEvent<OpenActionDetail>('cvc-open-action', {
      detail: { actionId, prefill },
      bubbles: true,
      composed: true,
    }),
  );
}

/** Shows a notification through the shell's toaster, from anywhere in the tree. */
export function pushToast(host: HTMLElement, toast: Toast): void {
  host.dispatchEvent(new CustomEvent<Toast>('cvc-toast', { detail: toast, bubbles: true, composed: true }));
}

/** Asks the shell to reload the summary (organisations, applications, add-ons, tags). */
export function requestSummaryRefresh(host: HTMLElement): void {
  host.dispatchEvent(new CustomEvent('cvc-refresh-summary', { bubbles: true, composed: true }));
}

declare global {
  interface HTMLElementEventMap {
    'cvc-open-action': CustomEvent<OpenActionDetail>;
    'cvc-toast': CustomEvent<Toast>;
    'cvc-refresh-summary': CustomEvent<void>;
  }
}
