import type { ActionValues } from '../../core/actions.js';

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

declare global {
  interface HTMLElementEventMap {
    'cvc-open-action': CustomEvent<OpenActionDetail>;
  }
}
