import { css, html, nothing } from 'lit';
import { t } from '../core/i18n.js';
import { CvcElement } from './shared/cvc-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../core/clever-client.js';
import type { Credentials } from '../core/credentials.js';
import type { AccountInfo, Session } from '../core/session.js';
import { newProfileId, type StoredProfile } from '../core/vault/vault.js';
import { appMark } from './shared/brand.js';
import './shared/cvc-cli.js';
import './shared/cvc-locale-switch.js';
import { sharedStyles } from './shared/styles.js';

/** What `pnpm dev:cli` serves: the API token of `CVC_DEV_API_TOKEN`. */
interface DevProfile {
  apiToken: string;
}

type Step = { kind: 'credentials' } | { kind: 'save'; credentials: Credentials; account: AccountInfo };

/**
 * Sign-in in two steps: an API token, verified against the API, then how to
 * keep it (encrypted vault or session only). When the vault already holds
 * accounts, the second step is skipped and the account is simply added. API
 * tokens only: the Console flow and the OAuth pair of `clever login` would
 * borrow the identity of clever-tools (#14).
 */
@customElement('cvc-login')
export class CvcLogin extends CvcElement {
  @property({ attribute: false }) session!: Session;
  /** True when adding an account to an existing, unlocked vault. */
  @property({ type: Boolean }) adding = false;

  @state() private step: Step = { kind: 'credentials' };
  @state() private busy = false;
  @state() private error: string | null = null;
  @state() private devProfile: DevProfile | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    if (import.meta.env.DEV) {
      void this.loadDevProfile();
    }
  }

  private async loadDevProfile(): Promise<void> {
    try {
      const response = await fetch('/__cvc/dev-profile', { cache: 'no-store' });
      if (response.ok) {
        this.devProfile = (await response.json()) as DevProfile;
      }
    } catch {
      // No dev helper: nothing to show.
    }
  }

  // --- step 1: credentials -------------------------------------------------

  private onApiTokenSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const apiToken = readField(event, 'apiToken');
    if (apiToken) {
      void this.verify({ type: 'api-token', apiToken });
    }
  }

  private async verify(credentials: Credentials): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      const account = await this.session.verify(credentials);
      if (this.adding || this.session.vault.state === 'unlocked') {
        await this.save(credentials, account, null);
      } else {
        this.step = { kind: 'save', credentials, account };
      }
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.busy = false;
    }
  }

  // --- step 2: persistence ------------------------------------------------

  private onSaveEncrypted(event: SubmitEvent): void {
    event.preventDefault();
    if (this.step.kind !== 'save') {
      return;
    }
    const passphrase = readField(event, 'passphrase');
    const confirmation = readField(event, 'confirmation');
    if (passphrase.length < 8) {
      this.error = t('login.error.passphraseLength');
      return;
    }
    if (passphrase !== confirmation) {
      this.error = t('login.error.mismatch');
      return;
    }
    void this.save(this.step.credentials, this.step.account, passphrase);
  }

  private onSaveSession(): void {
    if (this.step.kind === 'save') {
      void this.save(this.step.credentials, this.step.account, null, true);
    }
  }

  private async save(
    credentials: Credentials,
    account: AccountInfo,
    passphrase: string | null,
    sessionOnly = false,
  ): Promise<void> {
    this.busy = true;
    this.error = null;
    const profile: StoredProfile = {
      id: newProfileId(),
      alias: account.email,
      credentials,
      userId: account.userId,
      email: account.email,
      name: account.name,
      createdAt: new Date().toISOString(),
    };
    try {
      const vault = this.session.vault;
      if (vault.state === 'unlocked') {
        await vault.addProfile(profile);
      } else if (passphrase != null) {
        await vault.createEncrypted(passphrase, profile);
      } else if (sessionOnly) {
        await vault.createSessionOnly(profile);
      } else {
        throw new Error(t('login.error.choose'));
      }
      this.dispatchEvent(
        new CustomEvent<StoredProfile>('cvc-logged-in', { detail: profile, bubbles: true, composed: true }),
      );
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.busy = false;
    }
  }

  // --- rendering ---------------------------------------------------------

  override render() {
    return html`
      <main class="stack">
        <header>
          <div class="title">
            <h1>${appMark(26)}clever-visual-cli</h1>
            <cvc-locale-switch></cvc-locale-switch>
          </div>
          <p class="muted">${this.adding ? t('login.addAccount') : t('login.tagline')}</p>
        </header>
        ${
          this.session.vault.retired > 0
            ? html`<p class="notice small">${t('login.retired', { count: this.session.vault.retired })}</p>`
            : nothing
        }
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
        ${this.step.kind === 'credentials' ? this.renderCredentials() : this.renderSave(this.step.account)}
        ${
          this.adding
            ? html`<p class="small muted">
                <button
                  type="button"
                  class="link"
                  @click=${() => this.dispatchEvent(new CustomEvent('cvc-cancel', { bubbles: true, composed: true }))}
                >
                  ${t('common.cancel')}
                </button>
              </p>`
            : nothing
        }
      </main>
    `;
  }

  private renderCredentials() {
    return html`
      ${
        this.devProfile
          ? html`<section class="card dev">
              <h2>${t('login.devProfile.title')}</h2>
              <p class="muted small">
                ${t('login.devProfile.before')} <code>CVC_DEV_API_TOKEN</code>${t('login.devProfile.after')}
              </p>
              <button
                type="button"
                class="primary"
                ?disabled=${this.busy}
                @click=${() => this.verify({ type: 'api-token', apiToken: this.devProfile!.apiToken })}
              >
                ${t('login.devProfile.use')}
              </button>
            </section>`
          : nothing
      }

      <section class="card">
        <h2>${t('login.apiToken.title')}</h2>
        <p class="muted small">
          ${t('login.apiToken.before')} <cvc-cli command="clever tokens create clever-visual-cli"></cvc-cli>
        </p>
        <form class="row" @submit=${this.onApiTokenSubmit}>
          <input
            name="apiToken"
            type="password"
            autocomplete="off"
            placeholder=${t('login.apiToken.placeholder')}
            required
          />
          <button type="submit" class="primary" ?disabled=${this.busy}>${t('login.signIn')}</button>
        </form>
      </section>
    `;
  }

  private renderSave(account: AccountInfo) {
    return html`
      <section class="card stack">
        <div>
          <h2>${t('login.save.connected', { name: account.name ?? account.email })}</h2>
          <p class="muted small">${t('login.save.question')}</p>
        </div>

        <form class="stack" @submit=${this.onSaveEncrypted}>
          <h3>${t('login.save.encrypted.title')}</h3>
          <p class="muted small">${t('login.save.encrypted.text')}</p>
          <div class="row">
            <input
              name="passphrase"
              type="password"
              autocomplete="new-password"
              placeholder=${t('login.save.passphrase')}
              required
            />
            <input
              name="confirmation"
              type="password"
              autocomplete="new-password"
              placeholder=${t('login.save.confirmation')}
              required
            />
            <button type="submit" class="primary" ?disabled=${this.busy}>${t('common.save')}</button>
          </div>
        </form>

        <div class="stack">
          <h3>${t('login.save.session.title')}</h3>
          <p class="muted small">${t('login.save.session.text')}</p>
          <div>
            <button type="button" ?disabled=${this.busy} @click=${this.onSaveSession}>
              ${t('login.save.session.button')}
            </button>
          </div>
        </div>
      </section>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      main {
        max-width: 560px;
        margin: 0 auto;
        padding: 3rem 1rem;
      }
      header .title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      header h1 {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .notice {
        padding: 0.6rem 0.8rem;
        border: 1px solid color-mix(in srgb, var(--cvc-info) 40%, var(--cvc-border));
        border-radius: var(--cvc-radius);
        background: color-mix(in srgb, var(--cvc-info) 8%, transparent);
      }
      section.card h2 {
        margin-bottom: 0.25rem;
      }
      section.card p {
        margin-bottom: 0.75rem;
      }
      section.card form input {
        flex: 1 1 180px;
      }
      section.dev {
        border-color: var(--cvc-info);
      }
    `,
  ];
}

function readField(event: SubmitEvent, name: string): string {
  const form = event.currentTarget as HTMLFormElement;
  return ((new FormData(form).get(name) as string | null) ?? '').trim();
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-login': CvcLogin;
  }
}
