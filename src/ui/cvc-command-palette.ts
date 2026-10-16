import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { filterCommands, type PaletteCommand } from '../core/palette.js';
import { sharedStyles } from './shared/styles.js';

/**
 * The command palette (⌘K / Ctrl+K). The host provides the command list;
 * this component only filters, navigates with the keyboard and runs.
 */
@customElement('cvc-command-palette')
export class CvcCommandPalette extends LitElement {
  @property({ attribute: false }) commands: readonly PaletteCommand[] = [];

  @state() private opened = false;
  @state() private query = '';
  @state() private activeIndex = 0;

  @query('input') private input?: HTMLInputElement;

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    this.opened = true;
    this.query = '';
    this.activeIndex = 0;
    void this.updateComplete.then(() => this.input?.focus());
  }

  close(): void {
    this.opened = false;
  }

  toggle(): void {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  private get results(): PaletteCommand[] {
    return filterCommands(this.commands, this.query);
  }

  private onInput(event: Event): void {
    this.query = (event.currentTarget as HTMLInputElement).value;
    this.activeIndex = 0;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const results = this.results;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex = results.length === 0 ? 0 : (this.activeIndex + 1) % results.length;
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex = results.length === 0 ? 0 : (this.activeIndex - 1 + results.length) % results.length;
        this.scrollActiveIntoView();
        break;
      case 'Enter': {
        event.preventDefault();
        const command = results[this.activeIndex];
        if (command != null) {
          this.run(command);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  private scrollActiveIntoView(): void {
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector('li.active')?.scrollIntoView({ block: 'nearest' });
    });
  }

  private run(command: PaletteCommand): void {
    this.close();
    command.run();
  }

  override render() {
    if (!this.opened) {
      return nothing;
    }
    const results = this.results;
    let lastGroup: string | null = null;
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <div class="dialog" role="dialog" aria-label="Palette de commandes" @keydown=${this.onKeyDown}>
        <input
          type="search"
          placeholder="Application, organisation, page, action…"
          aria-label="Rechercher une commande"
          autocomplete="off"
          .value=${this.query}
          @input=${this.onInput}
        />
        <ul role="listbox">
          ${results.length === 0 ? html`<li class="empty">Aucun résultat</li>` : nothing}
          ${repeat(
            results,
            (command) => command.id,
            (command, index) => {
              const header = command.group !== lastGroup ? html`<li class="group">${command.group}</li>` : nothing;
              lastGroup = command.group;
              return html`${header}
                <li
                  class=${index === this.activeIndex ? 'active' : ''}
                  role="option"
                  aria-selected=${index === this.activeIndex}
                  @mousemove=${() => (this.activeIndex = index)}
                  @click=${() => this.run(command)}
                >
                  <span class="title">${command.title}</span>
                  ${command.subtitle ? html`<span class="subtitle">${command.subtitle}</span>` : nothing}
                  ${command.cli ? html`<span class="cli">${command.cli}</span>` : nothing}
                </li>`;
            },
          )}
        </ul>
        <footer class="muted small">↑↓ naviguer · ↵ ouvrir · esc fermer</footer>
      </div>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgb(0 0 0 / 35%);
        z-index: 40;
      }
      .dialog {
        position: fixed;
        top: 12vh;
        left: 50%;
        transform: translateX(-50%);
        width: min(640px, calc(100vw - 2rem));
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgb(0 0 0 / 30%);
        z-index: 41;
        overflow: hidden;
      }
      input {
        border: none;
        border-bottom: 1px solid var(--cvc-border);
        border-radius: 0;
        padding: 0.9rem 1rem;
        font-size: 1.05rem;
        background: transparent;
      }
      input:focus-visible {
        outline: none;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0.4rem 0;
        overflow: auto;
        flex: 1;
      }
      li {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
        padding: 0.45rem 1rem;
        cursor: pointer;
      }
      li.group {
        cursor: default;
        padding-top: 0.6rem;
        padding-bottom: 0.2rem;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--cvc-muted);
      }
      li.active {
        background: color-mix(in srgb, var(--cvc-accent) 12%, transparent);
      }
      li .title {
        flex: 0 1 auto;
      }
      li .subtitle {
        flex: 1 1 auto;
        color: var(--cvc-muted);
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      li .cli {
        margin-left: auto;
      }
      li.empty {
        color: var(--cvc-muted);
        cursor: default;
      }
      footer {
        padding: 0.4rem 1rem;
        border-top: 1px solid var(--cvc-border);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-command-palette': CvcCommandPalette;
  }
}
