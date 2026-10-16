import { LitElement } from 'lit';
import { localeChanges } from '../../core/i18n.js';

/** A LitElement that re-renders when the interface language changes. */
export class CvcElement extends LitElement {
  readonly #onLocaleChange = () => this.requestUpdate();

  override connectedCallback(): void {
    super.connectedCallback();
    localeChanges.addEventListener('change', this.#onLocaleChange);
  }

  override disconnectedCallback(): void {
    localeChanges.removeEventListener('change', this.#onLocaleChange);
    super.disconnectedCallback();
  }
}
