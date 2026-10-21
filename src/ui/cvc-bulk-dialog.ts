import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../core/clever-client.js';
import {
  bulkExecutor,
  describeBulkStep,
  planBulk,
  type BulkApp,
  type BulkKind,
  type BulkStep,
} from '../core/home/bulk.js';
import { runSteps, type RunResult } from '../core/home/tagging.js';
import { t } from '../core/i18n.js';
import type { Restart } from '../core/logs/deployment-logs.js';
import { CvcElement } from './shared/cvc-element.js';
import { APP_STATE_LABELS, stateLabel } from './shared/format.js';
import './shared/cvc-cli.js';
import { sharedStyles } from './shared/styles.js';

export interface BulkDoneDetail {
  kind: BulkKind;
  steps: BulkStep[];
  result: RunResult<BulkStep>;
  /** The deployments the restarts started, and when they were sent. */
  restarts: Restart[];
  startedAt: Date;
}

const MAX_PREVIEW = 40;

/**
 * Restart or stop the selected applications at once: the exact list, the
 * `clever` commands, a confirmation, a progress counter. Emits `cvc-bulk-done`
 * with the result, or `cvc-bulk-close`.
 */
@customElement('cvc-bulk-dialog')
export class CvcBulkDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() kind: BulkKind = 'restart';
  @property({ attribute: false }) apps: BulkApp[] = [];
  /** Add-ons in the selection, left out. */
  @property({ type: Number }) addons = 0;

  @state() private busy = false;
  @state() private progress = 0;
  @state() private error: string | null = null;

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('button.ghost')?.focus();
  }

  private close(): void {
    if (!this.busy) {
      this.dispatchEvent(new CustomEvent('cvc-bulk-close', { bubbles: true, composed: true }));
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
    const { steps } = planBulk(this.kind, this.apps);
    if (steps.length === 0 || this.busy) {
      return;
    }
    this.busy = true;
    this.progress = 0;
    this.error = null;
    const restarts: Restart[] = [];
    const startedAt = new Date();
    try {
      const executor = bulkExecutor(this.client, this.ownerId, (appId, deploymentId) =>
        restarts.push({ appId, deploymentId }),
      );
      const result = await runSteps(steps, executor, {
        onProgress: (done) => (this.progress = done),
        describe: describeError,
      });
      this.dispatchEvent(
        new CustomEvent<BulkDoneDetail>('cvc-bulk-done', {
          detail: { kind: this.kind, steps, result, restarts, startedAt },
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
    const plan = planBulk(this.kind, this.apps);
    const count = plan.steps.length;
    const restart = this.kind === 'restart';
    const leftOut = [
      plan.alreadyStopped.length > 0 ? t('bulk.alreadyStopped', { count: plan.alreadyStopped.length }) : '',
      this.addons > 0 ? t('bulk.addonsIgnored', { count: this.addons }) : '',
    ].filter((part) => part !== '');
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <form class="dialog" role="dialog" aria-labelledby="title" @submit=${this.submit} @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t(restart ? 'bulk.restart.title' : 'bulk.stop.title', { count })}</h2>
          <p class="muted small">${t(restart ? 'bulk.restart.hint' : 'bulk.stop.hint')}</p>
        </header>
        ${count === 0 ? html`<p class="muted small">${t('bulk.nothing')}</p>` : this.renderPlan(plan.steps)}
        ${leftOut.length > 0 ? html`<p class="muted small">${leftOut.join(' · ')}</p>` : nothing}
        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
        <footer class="row">
          ${this.busy ? html`<span class="muted small">${this.progress}/${count}</span>` : nothing}
          <button type="button" class="ghost" @click=${this.close} ?disabled=${this.busy}>${t('common.cancel')}</button>
          <button type="submit" class="primary ${restart ? '' : 'danger'}" ?disabled=${count === 0 || this.busy}>
            ${t(restart ? 'bulk.restart.submit' : 'bulk.stop.submit', { count })}
          </button>
        </footer>
      </form>
    `;
  }

  private renderPlan(steps: BulkStep[]) {
    return html`<div class="plan">
      <ul class="small">
        ${steps.slice(0, MAX_PREVIEW).map((step) => {
          const status = stateLabel(APP_STATE_LABELS, step.app.state);
          return html`<li><span class="badge ${status.tone}">${status.label}</span> ${step.app.name}</li>`;
        })}
        ${steps.length > MAX_PREVIEW ? html`<li class="muted">${t('tagDialog.more', { count: steps.length - MAX_PREVIEW })}</li>` : nothing}
      </ul>
      <div class="cli-block">
        <span class="muted small">${t('bulk.cliEquivalent')}</span>
        <cvc-cli
          block
          .command=${`${describeBulkStep(steps[0])}${steps.length > 1 ? `\n… × ${steps.length}` : ''}`}
          .script=${steps.map((step) => describeBulkStep(step)).join('\n')}
          .count=${steps.length}
        ></cvc-cli>
      </div>
    </div>`;
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
        width: min(640px, calc(100vw - 2rem));
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
      .plan ul {
        margin: 0 0 0.6rem;
        padding: 0;
        list-style: none;
        max-height: 30vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .plan li {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      .cli-block {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }

      button.primary.danger {
        background: var(--cvc-danger);
      }
      footer {
        justify-content: flex-end;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-bulk-dialog': CvcBulkDialog;
  }
}
