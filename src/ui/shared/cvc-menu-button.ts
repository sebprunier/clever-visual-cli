import { css, html, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { CvcElement } from './cvc-element.js';
import { sharedStyles } from './styles.js';

export interface MenuItem {
  id: string;
  label: string;
  /** Destructive: shown in the danger colour. */
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

export interface MenuSelectDetail {
  id: string;
}

/** Room kept between the menu and the edge of the window. */
const EDGE = 8;

/**
 * A button that opens a menu of actions, so a toolbar groups them by kind
 * ("Tags", "Applications") instead of growing with every new one. The menu
 * is a popover, drawn in the top layer and closed by a click outside;
 * arrows, Home and End move between items, Escape closes it without
 * reaching the page. Emits `cvc-menu-select` with the chosen item's id.
 */
@customElement('cvc-menu-button')
export class CvcMenuButton extends CvcElement {
  @property() label = '';
  @property({ attribute: false }) items: MenuItem[] = [];
  @property({ type: Boolean }) disabled = false;

  @state() private open = false;

  @query('.trigger') private trigger?: HTMLButtonElement;
  @query('[popover]') private menu?: HTMLElement;

  private get menuItems(): HTMLButtonElement[] {
    return [...(this.menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
  }

  /** Placed under the button before it shows, so it never flashes elsewhere. */
  private onBeforeToggle(event: Event): void {
    if ((event as Event & { newState?: string }).newState !== 'open' || this.trigger == null || this.menu == null) {
      return;
    }
    const rect = this.trigger.getBoundingClientRect();
    this.menu.style.top = `${rect.bottom + 4}px`;
    this.menu.style.left = `${rect.left}px`;
    this.menu.style.minWidth = `${rect.width}px`;
  }

  private onToggle(event: Event): void {
    this.open = (event as Event & { newState?: string }).newState === 'open';
    if (!this.open || this.menu == null) {
      return;
    }
    const { right } = this.menu.getBoundingClientRect();
    if (right > window.innerWidth - EDGE) {
      const left = Number.parseFloat(this.menu.style.left) - (right - (window.innerWidth - EDGE));
      this.menu.style.left = `${Math.max(EDGE, left)}px`;
    }
    this.menuItems[0]?.focus();
  }

  private onMenuKeyDown(event: KeyboardEvent): void {
    const items = this.menuItems;
    const index = items.indexOf(this.renderRoot.querySelector<HTMLButtonElement>(':focus') ?? items[0]);
    switch (event.key) {
      case 'Escape':
        // Closed here rather than by the browser, so the page does not also clear its selection.
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      case 'Tab':
        this.close(false);
        return;
      case 'ArrowDown':
        items[(index + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        items[(index - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        items[0]?.focus();
        break;
      case 'End':
        items[items.length - 1]?.focus();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** Arrow down on the button opens the menu, as a menu button does. */
  private onTriggerKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' && !this.disabled) {
      event.preventDefault();
      this.menu?.showPopover();
    }
  }

  private close(refocus = true): void {
    if (this.menu?.matches(':popover-open')) {
      this.menu.hidePopover();
    }
    if (refocus) {
      this.trigger?.focus();
    }
  }

  private select(item: MenuItem): void {
    this.close(false);
    this.dispatchEvent(new CustomEvent<MenuSelectDetail>('cvc-menu-select', { detail: { id: item.id } }));
  }

  override render() {
    return html`<button
        type="button"
        class="trigger ${this.open ? 'open' : ''}"
        popovertarget="menu"
        aria-haspopup="menu"
        aria-controls="menu"
        aria-expanded=${this.open}
        ?disabled=${this.disabled}
        @keydown=${this.onTriggerKeyDown}
      >
        ${this.label}
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
        id="menu"
        popover
        role="menu"
        aria-label=${this.label}
        @beforetoggle=${this.onBeforeToggle}
        @toggle=${this.onToggle}
        @keydown=${this.onMenuKeyDown}
      >
        ${this.items.map(
          (item) =>
            html`<button
              type="button"
              role="menuitem"
              class=${item.danger ? 'danger' : ''}
              title=${item.title ?? nothing}
              ?disabled=${item.disabled === true}
              @click=${() => this.select(item)}
            >
              ${item.label}
            </button>`,
        )}
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
        padding: 0.25rem 0.6rem 0.25rem 0.7rem;
        font-size: 0.85rem;
      }
      .trigger.open,
      .trigger:hover:not(:disabled) {
        border-color: var(--cvc-accent);
      }
      .caret {
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
        padding: 0.3rem;
        min-width: 10rem;
        color: var(--cvc-text);
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
        box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
      }
      [popover]:popover-open {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }
      [role='menuitem'] {
        text-align: left;
        padding: 0.35rem 0.6rem;
        font-size: 0.88rem;
        background: transparent;
        border: none;
        border-radius: 6px;
      }
      [role='menuitem']:hover:not(:disabled),
      [role='menuitem']:focus-visible {
        outline: none;
        background: color-mix(in srgb, var(--cvc-accent) 10%, transparent);
      }
      [role='menuitem'].danger {
        color: var(--cvc-danger);
      }
      [role='menuitem'].danger:hover:not(:disabled),
      [role='menuitem'].danger:focus-visible {
        background: color-mix(in srgb, var(--cvc-danger) 10%, transparent);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-menu-button': CvcMenuButton;
  }
}
