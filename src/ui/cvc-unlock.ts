import { css, html, nothing } from 'lit';
import { t } from '../core/i18n.js';
import { CvcElement } from './shared/cvc-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../core/clever-client.js';
import type { Vault } from '../core/vault/vault.js';
import { sharedStyles } from './shared/styles.js';

/** Passphrase prompt shown when an encrypted vault exists but the tab holds no key. */
@customElement('cvc-unlock')
export class CvcUnlock extends CvcElement {
  @property({ attribute: false }) vault!: Vault;

  @state() private busy = false;
  @state() private error: string | null = null;
  @state() private confirmForget = false;

  private async onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const passphrase = (new FormData(form).get('passphrase') as string | null) ?? '';
    if (passphrase.length === 0) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      await this.vault.unlock(passphrase);
      form.reset();
      this.dispatchEvent(new CustomEvent('cvc-unlocked', { bubbles: true, composed: true }));
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.busy = false;
    }
  }

  private forget(): void {
    this.vault.destroy();
    this.dispatchEvent(new CustomEvent('cvc-vault-forgotten', { bubbles: true, composed: true }));
  }

  override render() {
    return html`
      <main class="stack">
        <h1>${t('unlock.title')}</h1>
        <p class="muted">${t('unlock.text')}</p>
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
        <form class="row" @submit=${this.onSubmit}>
          <input
            name="passphrase"
            type="password"
            autocomplete="current-password"
            placeholder=${t('login.save.passphrase')}
            autofocus
            required
          />
          <button type="submit" class="primary" ?disabled=${this.busy}>
            ${this.busy ? t('unlock.busy') : t('unlock.button')}
          </button>
        </form>
        <p class="small muted">
          ${
            this.confirmForget
              ? html`${t('unlock.forgetWarning')}
                  <button type="button" class="link" @click=${this.forget}>${t('common.confirm')}</button>
                  <button type="button" class="link" @click=${() => (this.confirmForget = false)}>
                    ${t('common.cancel')}
                  </button>`
              : html`${t('unlock.lost')}
                  <button type="button" class="link" @click=${() => (this.confirmForget = true)}>
                    ${t('unlock.forget')}
                  </button>`
          }
        </p>
      </main>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      main {
        max-width: 480px;
        margin: 0 auto;
        padding: 4rem 1rem;
      }
      input {
        flex: 1 1 200px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-unlock': CvcUnlock;
  }
}
