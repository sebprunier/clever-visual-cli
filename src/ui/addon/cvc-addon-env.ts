import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../../core/clever-client.js';
import { maskValue, toDotenv } from '../../core/env.js';
import { t } from '../../core/i18n.js';
import { fetchAddonEnvironment, type EnvironmentVariable } from '../../data/api.js';
import { copyToClipboard } from '../shared/clipboard.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { ICON_REFRESH } from '../shared/icons.js';
import { sharedStyles } from '../shared/styles.js';

/** `clever addon env`: what the add-on exposes to the applications linked to it, values hidden until asked. */
@customElement('cvc-addon-env')
export class CvcAddonEnv extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() addonId = '';

  @state() private variables: EnvironmentVariable[] | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;
  @state() private revealed = false;
  @state() private copied: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('addonId')) {
      this.variables = null;
      this.revealed = false;
      void this.load();
    }
  }

  private async load(): Promise<void> {
    if (this.client == null || this.addonId === '') {
      return;
    }
    const { client, ownerId, addonId } = this;
    this.loading = true;
    this.error = null;
    try {
      const variables = await fetchAddonEnvironment(client, ownerId, addonId);
      if (this.addonId === addonId) {
        this.variables = [...variables].sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.loading = false;
    }
  }

  /** `key` is the variable's name, or `*` for the whole list: its button says "Copied!" a moment. */
  private async copy(text: string, key: string): Promise<void> {
    if (!(await copyToClipboard(text))) {
      this.error = t('env.clipboardError');
      return;
    }
    this.copied = key;
    setTimeout(() => {
      if (this.copied === key) {
        this.copied = null;
      }
    }, 1500);
  }

  override render() {
    const variables = this.variables;
    return html`
      <div class="row toolbar">
        <cvc-cli command=${`clever addon env ${this.addonId}`}></cvc-cli>
        <span class="grow"></span>
        <button
          type="button"
          class="ghost"
          ?disabled=${variables == null}
          @click=${() => (this.revealed = !this.revealed)}
        >
          ${this.revealed ? t('addon.env.hide') : t('addon.env.show')}
        </button>
        <button
          type="button"
          class="ghost"
          ?disabled=${variables == null || variables.length === 0}
          @click=${() => this.copy(toDotenv(variables ?? []), '*')}
        >
          ${this.copied === '*' ? t('common.copied') : t('env.copyDotenv')}
        </button>
        <button type="button" class="ghost with-icon" ?disabled=${this.loading} @click=${this.load}>
          ${ICON_REFRESH} ${t('common.refresh')}
        </button>
      </div>
      <p class="muted small hint">${t('addon.env.hint')}</p>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        variables == null
          ? html`<p class="empty">${t('common.loading')}</p>`
          : variables.length === 0
            ? html`<p class="empty">${t('addon.env.none')}</p>`
            : html`<div class="card table">
                <table>
                  <tbody>
                    ${variables.map(
                      (variable) =>
                        html`<tr>
                          <td class="name mono">${variable.name}</td>
                          <td class="value mono">${this.revealed ? variable.value : maskValue(variable.value)}</td>
                          <td class="actions">
                            <button
                              type="button"
                              class="ghost small"
                              @click=${() => this.copy(variable.value, variable.name)}
                            >
                              ${this.copied === variable.name ? t('common.copied') : t('common.copy')}
                            </button>
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`
      }
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      .toolbar {
        margin-bottom: 0.4rem;
      }
      .grow {
        flex: 1;
      }
      .hint {
        margin: 0 0 0.75rem;
      }
      .card.table {
        padding: 0 0.5rem;
        overflow-x: auto;
      }
      td.name {
        width: 1%;
        white-space: nowrap;
        font-weight: 600;
      }
      td.value {
        overflow-wrap: anywhere;
      }
      td.actions {
        width: 1%;
        text-align: right;
        white-space: nowrap;
      }
      button.small {
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-addon-env': CvcAddonEnv;
  }
}
