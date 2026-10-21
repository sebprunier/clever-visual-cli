import { css, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { getLocale, LOCALES, setLocale, t } from '../../core/i18n.js';
import { CvcElement } from './cvc-element.js';
import { sharedStyles } from './styles.js';

/**
 * "English · Français", for the pages shown before an account is open (signing
 * in, unlocking the vault), where the account menu is not there yet. The choice
 * is kept, as from the account menu.
 */
@customElement('cvc-locale-switch')
export class CvcLocaleSwitch extends CvcElement {
  override render() {
    const current = getLocale();
    return html`<nav class="small" aria-label=${t('common.language')}>
      ${LOCALES.map(
        (locale, index) =>
          html`${index > 0 ? html`<span class="muted" aria-hidden="true">·</span>` : nothing}
          ${
            locale.id === current
              ? html`<span aria-current="true">${locale.label}</span>`
              : html`<button type="button" class="link" lang=${locale.id} @click=${() => setLocale(locale.id)}>
                  ${locale.label}
                </button>`
          }`,
      )}
    </nav>`;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: inline-flex;
      }
      nav {
        display: inline-flex;
        align-items: baseline;
        gap: 0.4rem;
      }
      [aria-current] {
        font-weight: 600;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-locale-switch': CvcLocaleSwitch;
  }
}
