import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { t } from '../../core/i18n.js';
import { CvcElement } from '../shared/cvc-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import { fetchEnvironment, type Environment, type EnvironmentVariable } from '../../data/api.js';
import { openAction } from '../shared/events.js';
import { copyToClipboard } from '../shared/clipboard.js';
import '../shared/cvc-cli.js';
import { ICON_REFRESH } from '../shared/icons.js';
import { sharedStyles } from '../shared/styles.js';

/** The environment, values hidden until asked for. Changes go through the action dialog. */
@customElement('cvc-app-env')
export class CvcAppEnv extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';
  @property({ type: Number }) revision = 0;

  @state() private environment: Environment | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;
  @state() private revealed = false;
  @state() private copied: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId')) {
      this.revealed = false;
      void this.load();
    } else if (changed.has('revision')) {
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

  private copyAll(): void {
    const env = this.environment?.environment ?? [];
    void this.copy(env.map((v) => `${v.name}=${quote(v.value)}`).join('\n'), '*');
  }

  override render() {
    const env = this.environment;
    return html`
      <div class="row toolbar">
        <cvc-cli command=${`clever env --app ${this.appId}`}></cvc-cli>
        <span class="grow"></span>
        <button type="button" class="primary" @click=${() => openAction(this, 'env-set')}>${t('env.add')}</button>
        <button type="button" @click=${() => openAction(this, 'env-import')}>${t('env.import')}</button>
        <button type="button" class="ghost" ?disabled=${env == null} @click=${() => (this.revealed = !this.revealed)}>
          ${this.revealed ? t('env.hide') : t('env.show')}
        </button>
        <button type="button" class="ghost" ?disabled=${env == null} @click=${this.copyAll}>
          ${this.copied === '*' ? t('common.copied') : t('env.copyDotenv')}
        </button>
        <button type="button" class="ghost with-icon" ?disabled=${this.loading} @click=${this.load}>
          ${ICON_REFRESH} ${t('common.refresh')}
        </button>
      </div>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        env == null
          ? html`<p class="empty">${t('common.loading')}</p>`
          : html`
              ${this.renderTable(env.environment, 'app', true)}
              ${(env.linkedAddonsEnvironment ?? []).map(
                (linked) =>
                  html`<details class="card">
                    <summary>
                      ${t('env.linkedAddon')} <strong>${linked.addonName}</strong>
                      <span class="muted small"
                        >${linked.addonProviderId} · ${t('env.variables', { count: linked.environment.length })}</span
                      >
                    </summary>
                    ${this.renderTable(linked.environment, linked.addonId, false)}
                  </details>`,
              )}
              ${(env.linkedApplicationsEnvironment ?? []).map(
                (linked) =>
                  html`<details class="card">
                    <summary>
                      ${t('env.linkedApp')} <strong>${linked.applicationName}</strong>
                      <span class="muted small">${t('env.variables', { count: linked.environment.length })}</span>
                    </summary>
                    ${this.renderTable(linked.environment, linked.applicationId, false)}
                  </details>`,
              )}
            `
      }
    `;
  }

  private renderTable(variables: EnvironmentVariable[], scope: string, editable: boolean) {
    if (variables.length === 0) {
      return html`<p class="empty">${t('env.none')}</p>`;
    }
    return html`<div class="card table">
      <table>
        <thead>
          <tr>
            <th>${t('env.name')}</th>
            <th>${t('env.value')}</th>
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
                    ${this.copied === key ? t('common.copied') : t('common.copy')}
                  </button>
                  ${
                    editable
                      ? html`<button
                            type="button"
                            class="ghost small"
                            @click=${() => openAction(this, 'env-set', { name: variable.name, value: variable.value })}
                          >
                            ${t('common.edit')}
                          </button>
                          <button
                            type="button"
                            class="ghost small danger"
                            @click=${() => openAction(this, 'env-rm', { name: variable.name })}
                          >
                            ${t('common.remove')}
                          </button>`
                      : nothing
                  }
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
      button.danger {
        color: var(--cvc-danger);
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
