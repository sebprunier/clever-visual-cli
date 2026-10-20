import { css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../core/i18n.js';
import { copyToClipboard } from './clipboard.js';
import { CvcElement } from './cvc-element.js';
import { pushToast } from './events.js';

/** How long the copy control says "copied". */
const COPIED_FOR = 1500;

const COPY_ICON = html`<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
  <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4" />
  <path
    d="M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
  />
</svg>`;

const CHECK_ICON = html`<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
  <path
    d="M3 8.5l3 3 7-7"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

/**
 * A `clever` command as a screen shows it, one click away from a terminal:
 * a click on the command or on its copy control puts it in the clipboard.
 * Inline next to a title, or as a block in a dialog. What is copied can be
 * more than what is shown: a dialog shows the first of several commands and
 * copies the whole script, one command per line.
 */
@customElement('cvc-cli')
export class CvcCli extends CvcElement {
  /** The command as displayed. */
  @property() command = '';
  /** What the copy puts in the clipboard; the displayed command when empty. */
  @property() script = '';
  /** How many commands the copy holds, for the label of the control. */
  @property({ type: Number }) count = 1;
  /** A block, as in a dialog, rather than an inline chip. */
  @property({ type: Boolean, reflect: true }) block = false;

  @state() private copied = false;

  #timer: ReturnType<typeof setTimeout> | undefined;

  override disconnectedCallback(): void {
    clearTimeout(this.#timer);
    super.disconnectedCallback();
  }

  private async copy(): Promise<void> {
    if (!(await copyToClipboard(this.script || this.command))) {
      pushToast(this, { kind: 'error', message: t('cli.copyFailed') });
      return;
    }
    this.copied = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.copied = false), COPIED_FOR);
  }

  /** A click on the command copies it, unless the click ends the selection of a part of it. */
  private onCommandClick(): void {
    const root = this.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
    const selection = root?.getSelection?.() ?? document.getSelection();
    if (selection != null && !selection.isCollapsed && selection.toString().trim() !== '') {
      return;
    }
    void this.copy();
  }

  override render() {
    const label = this.copied
      ? t('cli.copied')
      : this.count > 1
        ? t('cli.copyAll', { count: this.count })
        : t('cli.copy');
    const status = html`<span class="sr-only" role="status">${this.copied ? t('cli.copied') : ''}</span>`;
    if (this.block) {
      return html`<div class="block">
          <code title=${t('cli.clickToCopy')} @click=${this.onCommandClick}>${this.command}</code>
          <button type="button" class="copy ${this.copied ? 'done' : ''}" @click=${this.copy}>${label}</button>
        </div>
        ${status}`;
    }
    return html`<span class="chip">
        <span class="prompt" aria-hidden="true">$</span>
        <code title="${this.command}&#10;${t('cli.clickToCopy')}" @click=${this.onCommandClick}>${this.command}</code>
        <button
          type="button"
          class="copy ${this.copied ? 'done' : ''}"
          title=${label}
          aria-label=${label}
          @click=${this.copy}
        >
          ${this.copied ? CHECK_ICON : COPY_ICON}
        </button>
      </span>
      ${status}`;
  }

  static override styles = css`
    :host {
      display: inline-flex;
      max-width: 100%;
      min-width: 0;
      vertical-align: middle;
      font-weight: 400;
      line-height: 1.4;
    }
    :host([block]) {
      display: block;
    }
    /* A pointer, not the copy cursor: on macOS that one is the drag-and-drop "+" and reads as "drop a copy here". */
    code {
      font: inherit;
      cursor: pointer;
    }
    button.copy {
      font: inherit;
      color: inherit;
      cursor: pointer;
      background: transparent;
      border: none;
    }
    button.copy:focus-visible {
      outline: 2px solid var(--cvc-accent);
      outline-offset: 1px;
    }
    button.copy.done {
      color: var(--cvc-ok);
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      max-width: 100%;
      padding: 0.1rem 0.15rem 0.1rem 0.5rem;
      font-family: var(--cvc-mono);
      font-size: 0.8rem;
      color: var(--cvc-muted);
      background: color-mix(in srgb, var(--cvc-muted) 10%, transparent);
      border-radius: 6px;
    }
    .prompt {
      opacity: 0.6;
    }
    .chip code {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip code:hover {
      color: var(--cvc-text);
    }
    .chip button.copy {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem;
      border-radius: 4px;
    }
    /* Hovering the command lights its copy control; :where() keeps the weight of a plain hover so "copied" still wins. */
    .chip button.copy:hover,
    .chip code:where(:hover) + button.copy {
      color: var(--cvc-accent);
      background: color-mix(in srgb, var(--cvc-accent) 10%, transparent);
    }
    .chip button.copy.done {
      color: var(--cvc-ok);
    }

    .block {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0.5rem 0.5rem 0.5rem 0.7rem;
      background: color-mix(in srgb, var(--cvc-muted) 10%, transparent);
      border-radius: 6px;
    }
    .block code {
      flex: 1;
      min-width: 0;
      padding-top: 0.15rem;
      font-family: var(--cvc-mono);
      font-size: 0.85rem;
      color: var(--cvc-text);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .block button.copy {
      flex: none;
      padding: 0.15rem 0.6rem;
      font-family: var(--cvc-font);
      font-size: 0.8rem;
      color: var(--cvc-text);
      background: var(--cvc-surface);
      border: 1px solid var(--cvc-border);
      border-radius: 6px;
    }
    .block button.copy:hover,
    .block code:where(:hover) + button.copy {
      color: var(--cvc-accent);
      border-color: var(--cvc-accent);
    }
    .block button.copy.done {
      color: var(--cvc-ok);
      border-color: color-mix(in srgb, var(--cvc-ok) 50%, var(--cvc-border));
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-cli': CvcCli;
  }
}
