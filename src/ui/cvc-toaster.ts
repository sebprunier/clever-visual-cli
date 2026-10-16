import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { sharedStyles } from './shared/styles.js';

export interface Toast {
  kind: 'success' | 'error' | 'info';
  message: string;
  /** An optional button, for instance to undo what the toast reports. */
  action?: { label: string; run: () => void };
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
    const delay = toast.kind === 'error' ? 12_000 : toast.action != null ? 15_000 : 6_000;
    setTimeout(() => this.dismiss(live.id), delay);
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
            html`<div class="toast ${toast.kind}">
              <span class="message">${toast.message}</span>
              ${
                toast.action != null
                  ? html`<button
                      type="button"
                      class="action"
                      @click=${() => {
                        toast.action?.run();
                        this.dismiss(toast.id);
                      }}
                    >
                      ${toast.action.label}
                    </button>`
                  : nothing
              }
              <button type="button" class="close" aria-label="Fermer" @click=${() => this.dismiss(toast.id)}>×</button>
            </div>`,
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
        display: flex;
        align-items: center;
        gap: 0.75rem;
        max-width: min(480px, calc(100vw - 2rem));
        padding: 0.7rem 0.9rem 0.7rem 1rem;
        border-radius: var(--cvc-radius);
        box-shadow: 0 10px 30px rgb(0 0 0 / 25%);
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-left: 4px solid var(--cvc-info);
      }
      .toast.success {
        border-left-color: var(--cvc-ok);
      }
      .toast.error {
        border-left-color: var(--cvc-danger);
      }
      .message {
        white-space: pre-wrap;
      }
      .action {
        padding: 0.25rem 0.7rem;
        font-size: 0.85rem;
        font-weight: 500;
      }
      .close {
        border: none;
        background: transparent;
        padding: 0 0.2rem;
        font-size: 1.1rem;
        line-height: 1;
        color: var(--cvc-muted);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-toaster': CvcToaster;
  }
}
