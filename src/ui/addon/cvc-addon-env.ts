import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sameVariables, type Variable } from '../../core/addons/config-provider.js';
import { describeError } from '../../core/clever-client.js';
import { maskValue, toDotenv } from '../../core/env.js';
import { t } from '../../core/i18n.js';
import {
  fetchAddonEnvironment,
  fetchConfigProviderEnvironment,
  replaceConfigProviderEnvironment,
  type ApplicationSummary,
  type EnvironmentVariable,
} from '../../data/api.js';
import { copyToClipboard } from '../shared/clipboard.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { pushToast } from '../shared/events.js';
import { ICON_REFRESH } from '../shared/icons.js';
import { sharedStyles } from '../shared/styles.js';
import './cvc-config-provider-editor.js';
import type { VariablesApplyDetail } from './cvc-config-provider-editor.js';

const byName = (variables: readonly EnvironmentVariable[]) =>
  [...variables].sort((a, b) => a.name.localeCompare(b.name));

/**
 * `clever addon env`: what the add-on exposes to the applications linked to
 * it, values hidden until asked. A configuration provider's variables are
 * also edited here (`clever config-provider`), in one write that Clever
 * Cloud follows with a redeployment of the linked applications.
 */
@customElement('cvc-addon-env')
export class CvcAddonEnv extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() addonId = '';
  @property() providerId = '';
  /** `config_…` for a configuration provider, whose route wants it. */
  @property() realId = '';
  /** The applications a configuration provider change redeploys. */
  @property({ attribute: false }) linkedApps: ApplicationSummary[] = [];

  @state() private variables: EnvironmentVariable[] | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;
  @state() private revealed = false;
  @state() private copied: string | null = null;
  @state() private editing = false;
  @state() private busy = false;
  @state() private editError: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('addonId')) {
      this.variables = null;
      this.revealed = false;
      this.editing = false;
      this.editError = null;
      void this.load();
    }
  }

  private get configProvider(): boolean {
    return this.providerId === 'config-provider' && this.realId !== '';
  }

  private read(): Promise<EnvironmentVariable[]> {
    return this.configProvider
      ? fetchConfigProviderEnvironment(this.client, this.realId)
      : fetchAddonEnvironment(this.client, this.ownerId, this.addonId);
  }

  private async load(): Promise<void> {
    if (this.client == null || this.addonId === '') {
      return;
    }
    const addonId = this.addonId;
    this.loading = true;
    this.error = null;
    try {
      const variables = await this.read();
      if (this.addonId === addonId) {
        this.variables = byName(variables);
      }
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.loading = false;
    }
  }

  /**
   * One write of the whole list, after checking nobody changed it since the
   * editing started. The toast offers to write the previous list back.
   */
  private async apply(event: CustomEvent<VariablesApplyDetail>): Promise<void> {
    const { before, after } = event.detail;
    const { client, realId, addonId } = this;
    const redeployed = this.linkedApps.length;
    this.busy = true;
    this.editError = null;
    try {
      if (!sameVariables(await fetchConfigProviderEnvironment(client, realId), before)) {
        this.editError = t('cpEdit.conflict');
        return;
      }
      const written = await replaceConfigProviderEnvironment(client, realId, after);
      if (this.addonId === addonId) {
        this.variables = byName(written);
        this.editing = false;
      }
      pushToast(this, {
        kind: 'success',
        message: redeployed === 0 ? t('cpEdit.applied') : t('cpEdit.appliedRedeploy', { count: redeployed }),
        action: { label: t('cpEdit.undo'), run: () => void this.undo(client, realId, addonId, after, before) },
      });
    } catch (error) {
      this.editError = describeError(error);
    } finally {
      this.busy = false;
    }
  }

  private async undo(
    client: CcApiClient,
    realId: string,
    addonId: string,
    written: Variable[],
    previous: Variable[],
  ): Promise<void> {
    try {
      if (!sameVariables(await fetchConfigProviderEnvironment(client, realId), written)) {
        pushToast(this, { kind: 'error', message: t('cpEdit.undoConflict') });
        return;
      }
      const restored = await replaceConfigProviderEnvironment(client, realId, previous);
      if (this.isConnected && this.addonId === addonId && !this.editing) {
        this.variables = byName(restored);
      }
      pushToast(this, { kind: 'info', message: t('cpEdit.undone') });
    } catch (error) {
      pushToast(this, { kind: 'error', message: t('cpEdit.undoFailed', { error: describeError(error) }) });
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
        <cvc-cli
          command=${this.configProvider ? `clever config-provider get ${this.addonId}` : `clever addon env ${this.addonId}`}
        ></cvc-cli>
        <span class="grow"></span>
        ${
          // Editing shows the values, copies nothing yet and must not reload under the draft.
          this.editing
            ? nothing
            : html`${
                  this.configProvider
                    ? html`<button
                        type="button"
                        class="primary"
                        ?disabled=${variables == null}
                        @click=${() => {
                          this.editError = null;
                          this.editing = true;
                        }}
                      >
                        ${t('common.edit')}
                      </button>`
                    : nothing
                }
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
                </button>`
        }
      </div>
      <p class="muted small hint">${t(this.configProvider ? 'cpEdit.hint' : 'addon.env.hint')}</p>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${
        variables == null
          ? html`<p class="empty">${t('common.loading')}</p>`
          : this.editing
            ? html`<cvc-config-provider-editor
                addonId=${this.addonId}
                .variables=${variables}
                .linkedApps=${this.linkedApps}
                ?busy=${this.busy}
                .error=${this.editError}
                @cvc-variables-apply=${this.apply}
                @cvc-variables-cancel=${() => (this.editing = false)}
              ></cvc-config-provider-editor>`
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
