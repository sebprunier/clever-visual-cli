import { css, html } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { CvcElement } from './cvc-element.js';
import { sharedStyles } from './styles.js';

/** The margin kept to the window's edges. */
const EDGE = 8;

/**
 * A button that opens a panel under it, its right edge on the button's, as the
 * "Views" menu does. The button's content (`label` slot) and the panel's
 * (default slot) are the page's own elements, so the page renders and styles
 * them and hears their events. Escape closes the panel and gives the focus
 * back to the button; so does `close()`.
 */
@customElement('cvc-dropdown')
export class CvcDropdown extends CvcElement {
  /** The panel's accessible name. */
  @property() label = '';
  /** The button's tooltip. */
  @property({ attribute: 'button-title' }) buttonTitle = '';
  /** In the accent colour, as the "Views" button on a favourite. */
  @property({ type: Boolean }) active = false;
  @property({ type: Number }) width = 360;

  @state() private open = false;
  @query('.trigger') private trigger?: HTMLButtonElement;
  @query('[popover]') private panel?: HTMLElement;

  close(): void {
    if (this.panel?.matches(':popover-open')) {
      this.panel.hidePopover();
    }
    this.trigger?.focus();
  }

  private onBeforeToggle(event: Event): void {
    if ((event as Event & { newState?: string }).newState !== 'open' || this.trigger == null || this.panel == null) {
      return;
    }
    const rect = this.trigger.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(EDGE, rect.right - this.width)}px`;
    this.panel.style.width = `min(${this.width}px, calc(100vw - ${2 * EDGE}px))`;
  }

  private onToggle(event: Event): void {
    this.open = (event as Event & { newState?: string }).newState === 'open';
    if (this.open) {
      // The checked choice, else the first control of the panel.
      this.querySelector<HTMLElement>('input:checked, button, input, a[href], summary')?.focus();
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Closed here rather than by the browser, so the page does not also clear its selection.
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  override render() {
    return html`<button
        type="button"
        class="trigger ${this.open ? 'open' : ''} ${this.active ? 'active' : ''}"
        popovertarget="panel"
        aria-haspopup="dialog"
        aria-controls="panel"
        aria-expanded=${this.open}
        title=${this.buttonTitle}
      >
        <span class="label"><slot name="label"></slot></span>
        <svg class="caret" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div
        id="panel"
        popover
        role="dialog"
        aria-label=${this.label}
        @beforetoggle=${this.onBeforeToggle}
        @toggle=${this.onToggle}
        @keydown=${this.onKeyDown}
      >
        <slot></slot>
      </div>`;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: inline-flex;
      }
      .trigger {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        max-width: 16rem;
        padding: 0.3rem 0.6rem 0.3rem 0.65rem;
        font-size: 0.85rem;
        background: transparent;
      }
      .trigger .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .trigger.active {
        color: var(--cvc-accent);
      }
      .trigger.open,
      .trigger:hover {
        border-color: var(--cvc-accent);
      }
      .caret {
        flex: none;
        opacity: 0.7;
        transition: transform 0.15s;
      }
      .trigger.open .caret {
        transform: rotate(180deg);
      }
      [popover] {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        max-height: calc(100vh - 6rem);
        overflow: auto;
        padding: 0.6rem 0.7rem;
        color: var(--cvc-text);
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
        box-shadow: var(--cvc-shadow-pop);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-dropdown': CvcDropdown;
  }
}
