import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { operatorCommand, type OperatorAction } from '../../core/addons/operator.js';
import { describeError } from '../../core/clever-client.js';
import { t, type MessageKey } from '../../core/i18n.js';
import {
  rebootOperator,
  rebuildOperator,
  updateOperatorVersion,
  type OperatorKind,
  type OperatorVersions,
} from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { sharedStyles } from '../shared/styles.js';

const TEXTS: Readonly<
  Record<OperatorAction, { title: MessageKey; hint: MessageKey; submit: MessageKey; done: MessageKey }>
> = {
  restart: {
    title: 'operatorDialog.restart.title',
    hint: 'operatorDialog.restart.hint',
    submit: 'operatorDialog.restart.submit',
    done: 'operatorDialog.restart.done',
  },
  rebuild: {
    title: 'operatorDialog.rebuild.title',
    hint: 'operatorDialog.rebuild.hint',
    submit: 'operatorDialog.rebuild.submit',
    done: 'operatorDialog.rebuild.done',
  },
  update: {
    title: 'operatorDialog.update.title',
    hint: 'operatorDialog.update.hint',
    submit: 'operatorDialog.update.submit',
    done: 'operatorDialog.update.done',
  },
};

export interface OperatorDoneDetail {
  message: string;
}

/**
 * Restart, rebuild or update an operator (`clever keycloak|otoroshi …`): what
 * it does, the command, a confirmation. Emits `cvc-operator-done` with the
 * message to show, or `cvc-operator-close`.
 */
@customElement('cvc-operator-dialog')
export class CvcOperatorDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() kind: OperatorKind = 'keycloak';
  @property() action: OperatorAction = 'restart';
  @property() addonId = '';
  @property() realId = '';
  @property() name = '';
  /** For an update: the installed version and the ones to move to. */
  @property({ attribute: false }) versions: OperatorVersions | null = null;

  @state() private target = '';
  @state() private busy = false;
  @state() private error: string | null = null;

  override willUpdate(): void {
    if (this.target === '' && this.versions != null) {
      this.target = this.versions.latest;
    }
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('button.ghost')?.focus();
  }

  private close(): void {
    if (!this.busy) {
      this.dispatchEvent(new CustomEvent('cvc-operator-close', { bubbles: true, composed: true }));
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  private async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy || (this.action === 'update' && this.target === '')) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      if (this.action === 'restart') {
        await rebootOperator(this.client, this.kind, this.realId);
      } else if (this.action === 'rebuild') {
        await rebuildOperator(this.client, this.kind, this.realId);
      } else {
        await updateOperatorVersion(this.client, this.kind, this.realId, this.target);
      }
      this.dispatchEvent(
        new CustomEvent<OperatorDoneDetail>('cvc-operator-done', {
          detail: { message: t(TEXTS[this.action].done, { name: this.name, version: this.target }) },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.busy = false;
    }
  }

  override render() {
    const texts = TEXTS[this.action];
    const update = this.action === 'update';
    // Newest first, as `clever … version update` offers them: the API lists them oldest first.
    const available = [...(this.versions?.available ?? [])].reverse();
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <form class="dialog" role="dialog" aria-labelledby="title" @submit=${this.submit} @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t(texts.title, { name: this.name })}</h2>
          <p class="muted small">${t(texts.hint)}</p>
        </header>
        ${
          update
            ? html`<label class="target">
                <span>${t('operatorDialog.target')}</span>
                <select
                  .value=${this.target}
                  ?disabled=${this.busy}
                  @change=${(event: Event) => (this.target = (event.currentTarget as HTMLSelectElement).value)}
                >
                  ${available.map(
                    (version) =>
                      html`<option value=${version} ?selected=${version === this.target}>
                        ${version === this.versions?.latest ? t('operatorDialog.latest', { version }) : version}
                      </option>`,
                  )}
                </select>
                ${
                  this.versions == null
                    ? nothing
                    : html`<span class="muted small">
                        ${t('operatorDialog.installed', { version: this.versions.installed })}
                      </span>`
                }
              </label>`
            : nothing
        }
        <div class="cli-block">
          <span class="muted small">${t('operatorDialog.cli')}</span>
          <cvc-cli block command=${operatorCommand(this.kind, this.action, this.addonId, this.target)}></cvc-cli>
        </div>
        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
        <footer class="row">
          <button type="button" class="ghost" @click=${this.close} ?disabled=${this.busy}>${t('common.cancel')}</button>
          <button type="submit" class="primary" ?disabled=${this.busy || (update && this.target === '')}>
            ${this.busy ? t('common.loading') : t(texts.submit)}
          </button>
        </footer>
      </form>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      .backdrop {
        position: fixed;
        inset: 0;
        background: var(--cvc-backdrop);
        z-index: 40;
      }
      .dialog {
        position: fixed;
        top: 8vh;
        left: 50%;
        transform: translateX(-50%);
        width: min(560px, calc(100vw - 2rem));
        max-height: 84vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        padding: 1.25rem 1.5rem;
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: 12px;
        box-shadow: var(--cvc-shadow-pop);
        z-index: 41;
      }
      header p {
        margin-top: 0.3rem;
      }
      .target {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.6rem;
      }
      .cli-block {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      footer {
        justify-content: flex-end;
        gap: 0.5rem;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-operator-dialog': CvcOperatorDialog;
  }
  interface HTMLElementEventMap {
    'cvc-operator-done': CustomEvent<OperatorDoneDetail>;
    'cvc-operator-close': CustomEvent<undefined>;
  }
}
