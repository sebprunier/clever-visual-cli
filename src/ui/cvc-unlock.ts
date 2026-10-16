import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../core/clever-client.js';
import type { Vault } from '../core/vault/vault.js';
import { sharedStyles } from './shared/styles.js';

/** Passphrase prompt shown when an encrypted vault exists but the tab holds no key. */
@customElement('cvc-unlock')
export class CvcUnlock extends LitElement {
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
        <h1>Coffre verrouillé</h1>
        <p class="muted">Vos accès Clever Cloud sont chiffrés dans ce navigateur. Entrez votre phrase de passe.</p>
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
        <form class="row" @submit=${this.onSubmit}>
          <input
            name="passphrase"
            type="password"
            autocomplete="current-password"
            placeholder="Phrase de passe"
            autofocus
            required
          />
          <button type="submit" class="primary" ?disabled=${this.busy}>
            ${this.busy ? 'Déverrouillage…' : 'Déverrouiller'}
          </button>
        </form>
        <p class="small muted">
          ${
            this.confirmForget
              ? html`Le coffre sera effacé de ce navigateur. Vos tokens restent valides côté Clever Cloud.
                  <button type="button" class="link" @click=${this.forget}>Confirmer</button>
                  <button type="button" class="link" @click=${() => (this.confirmForget = false)}>Annuler</button>`
              : html`Phrase perdue ?
                  <button type="button" class="link" @click=${() => (this.confirmForget = true)}>
                    Oublier ce coffre
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
