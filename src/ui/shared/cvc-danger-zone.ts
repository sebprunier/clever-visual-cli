import { css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../core/i18n.js';
import { CvcElement } from './cvc-element.js';
import './cvc-cli.js';
import { openAction } from './events.js';
import { sharedStyles } from './styles.js';

/** One block of the danger zone: what it does, its command, and the button that opens its dialog. */
export interface DangerItem {
  title: string;
  text: string;
  cli: string;
  label: string;
  actionId: string;
  /** Red, for what cannot be undone. */
  destructive: boolean;
}

/** The last tab of an application or an add-on, as the end of the Console's settings (#31). */
@customElement('cvc-danger-zone')
export class CvcDangerZone extends CvcElement {
  @property({ attribute: false }) items: readonly DangerItem[] = [];

  override render() {
    return html`<section class="zone" aria-label=${t('danger.aria')}>
      ${this.items.map(
        (item) =>
          html`<div class="card item ${item.destructive ? 'destructive' : ''}">
            <div class="row head">
              <div class="grow">
                <h3>${item.title}</h3>
                <p class="muted small">${item.text}</p>
              </div>
              <button
                type="button"
                class=${item.destructive ? 'destroy' : ''}
                @click=${() => openAction(this, item.actionId)}
              >
                ${item.label}
              </button>
            </div>
            <cvc-cli command=${item.cli}></cvc-cli>
          </div>`,
      )}
    </section>`;
  }

  static override styles = [
    sharedStyles,
    css`
      .zone {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 56rem;
      }
      .item {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .item.destructive {
        border-color: color-mix(in srgb, var(--cvc-danger) 45%, var(--cvc-border));
      }
      .head {
        align-items: flex-start;
        gap: 1rem;
      }
      .grow {
        flex: 1;
        min-width: 0;
      }
      h3 {
        margin: 0 0 0.25rem;
        font-size: 1rem;
      }
      p {
        margin: 0;
      }
      button {
        flex-shrink: 0;
      }
      button.destroy {
        background: var(--cvc-danger);
        color: var(--cvc-accent-text);
        border-color: transparent;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-danger-zone': CvcDangerZone;
  }
}
