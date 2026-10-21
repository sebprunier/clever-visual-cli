import { css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { docsUrl } from '../../core/docs.js';
import { t } from '../../core/i18n.js';
import { CvcElement } from './cvc-element.js';
import { sharedStyles } from './styles.js';

/**
 * The small "?" beside the title of a page: the section of the documentation
 * about it, in a new tab so the page stays as it is.
 */
@customElement('cvc-doc-link')
export class CvcDocLink extends CvcElement {
  /** The page and section, as `guide/application.html#logs`. */
  @property() path = '';
  /** What the section is about, for the tooltip. */
  @property() topic = '';

  override render() {
    const title = this.topic === '' ? t('docs.open') : t('docs.about', { topic: this.topic });
    return html`<a href=${docsUrl(this.path)} target="_blank" rel="noopener" title=${title} aria-label=${title}>?</a>`;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: inline-flex;
        vertical-align: middle;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.2rem;
        height: 1.2rem;
        border: 1px solid var(--cvc-border);
        border-radius: 50%;
        font-size: 0.72rem;
        font-weight: 600;
        line-height: 1;
        color: var(--cvc-muted);
        text-decoration: none;
      }
      a:hover,
      a:focus-visible {
        color: var(--cvc-accent);
        border-color: var(--cvc-accent);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-doc-link': CvcDocLink;
  }
}
