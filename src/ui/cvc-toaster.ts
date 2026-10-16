import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { sharedStyles } from './shared/styles.js';

export interface Toast {
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface LiveToast extends Toast {
  id: number;
}

/** Bottom-right notifications, auto-dismissed. `push()` is the only API. */
@customElement('cvc-toaster')
export class CvcToaster extends LitElement {
  @state() private toasts: LiveToast[] = [];

  #nextId = 1;

  push(toast: Toast): void {
    const live = { ...toast, id: this.#nextId++ };
    this.toasts = [...this.toasts, live];
    setTimeout(() => this.dismiss(live.id), toast.kind === 'error' ? 12_000 : 6_000);
  }

  private dismiss(id: number): void {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
  }

  override render() {
    return html`
      <div class="stack" role="status" aria-live="polite">
        ${repeat(
          this.toasts,
          (toast) => toast.id,
          (toast) =>
            html`<button type="button" class="toast ${toast.kind}" @click=${() => this.dismiss(toast.id)}>
              ${toast.message}
            </button>`,
        )}
      </div>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 50;
        pointer-events: none;
      }
      .stack {
        align-items: flex-end;
      }
      .toast {
        pointer-events: auto;
        max-width: min(420px, calc(100vw - 2rem));
        text-align: left;
        white-space: pre-wrap;
        padding: 0.7rem 1rem;
        border-radius: var(--cvc-radius);
        box-shadow: 0 10px 30px rgb(0 0 0 / 25%);
        background: var(--cvc-surface);
        border-left: 4px solid var(--cvc-info);
      }
      .toast.success {
        border-left-color: var(--cvc-ok);
      }
      .toast.error {
        border-left-color: var(--cvc-danger);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-toaster': CvcToaster;
  }
}
