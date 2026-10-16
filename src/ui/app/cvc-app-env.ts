import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import { fetchEnvironment, type Environment } from '../../data/api.js';
import { sharedStyles } from '../shared/styles.js';

interface EnvVar {
  name: string;
  value: string;
}

/** Read-only environment, with the values hidden until asked for. Editing comes with phase 2. */
@customElement('cvc-app-env')
export class CvcAppEnv extends LitElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';

  @state() private environment: Environment | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;
  @state() private revealed = false;
  @state() private copied: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId')) {
      this.revealed = false;
      void this.load();
    }
  }

  private async load(): Promise<void> {
    if (this.client == null || this.appId === '') {
      return;
    }
    const { client, ownerId, appId } = this;
    this.loading = true;
    this.error = null;
    try {
      const environment = await fetchEnvironment(client, ownerId, appId);
      if (this.appId === appId) {
        this.environment = environment;
      }
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.loading = false;
    }
  }

  private async copy(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied = key;
      setTimeout(() => {
        if (this.copied === key) {
          this.copied = null;
        }
      }, 1500);
    } catch {
      this.error = 'Impossible de copier dans le presse-papiers.';
    }
  }

  private copyAll(): void {
    const env = this.environment?.environment ?? [];
    void this.copy(env.map((v) => `${v.name}=${quote(v.value)}`).join('\n'), '*');
  }

  override render() {
    const env = this.environment;
    return html`
      <div class="row toolbar">
        <span class="cli">clever env --app ${this.appId}</span>
        <span class="grow"></span>
        <button type="button" class="ghost" ?disabled=${env == null} @click=${() => (this.revealed = !this.revealed)}>
          ${this.revealed ? 'Masquer les valeurs' : 'Afficher les valeurs'}
        </button>
        <button type="button" class="ghost" ?disabled=${env == null} @click=${this.copyAll}>
          ${this.copied === '*' ? 'Copié !' : 'Copier en .env'}
        </button>
        <button type="button" class="ghost" ?disabled=${this.loading} @click=${this.load}>Rafraîchir</button>
      </div>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        env == null
          ? html`<p class="empty">Chargement…</p>`
          : html`
              ${this.renderTable(env.environment, 'app')}
              ${(env.linkedAddonsEnvironment ?? []).map(
                (linked) =>
                  html`<details class="card">
                    <summary>
                      Add-on lié : <strong>${linked.addonName}</strong>
                      <span class="muted small"
                        >${linked.addonProviderId} · ${linked.environment.length} variables</span
                      >
                    </summary>
                    ${this.renderTable(linked.environment, linked.addonId)}
                  </details>`,
              )}
              ${(env.linkedApplicationsEnvironment ?? []).map(
                (linked) =>
                  html`<details class="card">
                    <summary>
                      Application liée : <strong>${linked.applicationName}</strong>
                      <span class="muted small">${linked.environment.length} variables</span>
                    </summary>
                    ${this.renderTable(linked.environment, linked.applicationId)}
                  </details>`,
              )}
            `
      }
    `;
  }

  private renderTable(variables: EnvVar[], scope: string) {
    if (variables.length === 0) {
      return html`<p class="empty">Aucune variable.</p>`;
    }
    return html`<div class="card table">
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Valeur</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${repeat(
            variables,
            (variable) => `${scope}:${variable.name}`,
            (variable) => {
              const key = `${scope}:${variable.name}`;
              return html`<tr>
                <td class="mono name">${variable.name}</td>
                <td class="mono value">${this.revealed ? variable.value : mask(variable.value)}</td>
                <td class="actions">
                  <button type="button" class="ghost small" @click=${() => this.copy(variable.value, key)}>
                    ${this.copied === key ? 'Copié !' : 'Copier'}
                  </button>
                </td>
              </tr>`;
            },
          )}
        </tbody>
      </table>
    </div>`;
  }

  static override styles = [
    sharedStyles,
    css`
      .toolbar {
        margin-bottom: 0.75rem;
      }
      .grow {
        flex: 1;
      }
      .card.table {
        padding: 0 0.5rem;
        overflow-x: auto;
      }
      details.card {
        margin-top: 0.75rem;
        padding: 0.6rem 0.9rem;
      }
      details.card summary {
        cursor: pointer;
      }
      details.card .table {
        margin-top: 0.6rem;
        border: none;
      }
      td.name {
        white-space: nowrap;
        font-weight: 500;
      }
      td.value {
        overflow-wrap: anywhere;
        max-width: 60ch;
      }
      td.actions {
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

function mask(value: string): string {
  return value.length === 0 ? '' : '•'.repeat(Math.min(Math.max(value.length, 6), 24));
}

function quote(value: string): string {
  return /^[A-Za-z0-9_./:@=+-]*$/.test(value)
    ? value
    : `"${value.replace(/(["\\$`])/g, '\\$1').replace(/\n/g, '\\n')}"`;
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-env': CvcAppEnv;
  }
}
