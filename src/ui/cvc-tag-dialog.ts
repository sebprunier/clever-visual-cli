import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing } from 'lit';
import { t, type MessageKey } from '../core/i18n.js';
import { CvcElement } from './shared/cvc-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../core/clever-client.js';
import {
  apiExecutor,
  describeStep,
  planTagOperation,
  runSteps,
  tagsOf,
  validateTag,
  type TagOperation,
  type TagResource,
  type TagRunResult,
  type TagStep,
} from '../core/home/tagging.js';
import './shared/cvc-cli.js';
import { sharedStyles } from './shared/styles.js';

export type TagOperationKind = TagOperation['kind'];

export interface TagsAppliedDetail {
  steps: TagStep[];
  result: TagRunResult;
}

const KIND_LABELS: Record<TagOperationKind, MessageKey> = {
  add: 'home.addTag',
  remove: 'home.removeTag',
  rename: 'home.renameTag',
};

const MAX_PREVIEW = 40;

/**
 * Bulk tag operation on the selected resources: pick the operation, see the
 * exact plan and the HTTP calls, apply with a progress counter. Emits
 * `cvc-tags-applied` with the result, or `cvc-tag-close`.
 */
@customElement('cvc-tag-dialog')
export class CvcTagDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property({ attribute: false }) resources: TagResource[] = [];
  /** Tags in use in the organisation, suggested while typing. */
  @property({ attribute: false }) suggestions: string[] = [];
  @property() kind: TagOperationKind = 'add';

  @state() private tag = '';
  @state() private from = '';
  @state() private to = '';
  @state() private busy = false;
  @state() private progress = 0;
  @state() private error: string | null = null;

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('input, select')?.focus();
  }

  private get present(): string[] {
    return tagsOf(this.resources);
  }

  private get operation(): TagOperation | null {
    switch (this.kind) {
      case 'add':
        return validateTag(this.tag) == null ? { kind: 'add', tag: this.tag.trim() } : null;
      case 'remove':
        return this.tag !== '' ? { kind: 'remove', tag: this.tag } : null;
      case 'rename':
        return this.from !== '' && validateTag(this.to) == null
          ? { kind: 'rename', from: this.from, to: this.to.trim() }
          : null;
    }
  }

  private get plan(): TagStep[] {
    const operation = this.operation;
    return operation == null ? [] : planTagOperation(operation, this.resources);
  }

  private close(): void {
    if (!this.busy) {
      this.dispatchEvent(new CustomEvent('cvc-tag-close', { bubbles: true, composed: true }));
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  private setKind(kind: TagOperationKind): void {
    this.kind = kind;
    this.tag = '';
    this.error = null;
  }

  private async submit(event: Event): Promise<void> {
    event.preventDefault();
    const steps = this.plan;
    if (steps.length === 0 || this.busy) {
      return;
    }
    this.busy = true;
    this.progress = 0;
    this.error = null;
    try {
      const result = await runSteps(steps, apiExecutor(this.client, this.ownerId), {
        onProgress: (done) => (this.progress = done),
        describe: describeError,
      });
      this.dispatchEvent(
        new CustomEvent<TagsAppliedDetail>('cvc-tags-applied', {
          detail: { steps, result },
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
    const apps = this.resources.filter((resource) => resource.kind === 'app').length;
    const addons = this.resources.length - apps;
    const plan = this.plan;
    const validation =
      this.kind === 'add' && this.tag !== ''
        ? validateTag(this.tag)
        : this.kind === 'rename' && this.to !== ''
          ? validateTag(this.to)
          : null;
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <form class="dialog" role="dialog" aria-labelledby="title" @submit=${this.submit} @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t(KIND_LABELS[this.kind])}</h2>
          <p class="muted small">
            ${t('tagDialog.selected', { count: this.resources.length, apps, addons })} ${t('tagDialog.convention')}
          </p>
        </header>
        <div class="seg" role="group" aria-label=${t('tagDialog.operationAria')}>
          ${(Object.keys(KIND_LABELS) as TagOperationKind[]).map(
            (kind) =>
              html`<button
                type="button"
                class=${kind === this.kind ? 'on' : ''}
                aria-pressed=${kind === this.kind}
                ?disabled=${this.busy}
                @click=${() => this.setKind(kind)}
              >
                ${t(KIND_LABELS[kind])}
              </button>`,
          )}
        </div>
        ${this.renderFields()}
        ${validation != null ? html`<p class="error small" role="alert">${validation}</p>` : nothing}
        ${this.renderPlan(plan)} ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
        <footer class="row">
          ${this.busy ? html`<span class="muted small">${this.progress}/${plan.length}</span>` : nothing}
          <button type="button" class="ghost" @click=${this.close} ?disabled=${this.busy}>${t('common.cancel')}</button>
          <button type="submit" class="primary" ?disabled=${plan.length === 0 || this.busy}>
            ${t('common.apply')}${plan.length > 0 ? ` (${plan.length})` : ''}
          </button>
        </footer>
      </form>
    `;
  }

  private renderFields() {
    const datalist = html`<datalist id="tag-suggestions">
      ${this.suggestions.map((suggestion) => html`<option value=${suggestion}></option>`)}
    </datalist>`;
    switch (this.kind) {
      case 'add':
        return html`<div class="field">
          <label for="tag">${t('tagDialog.tagToAdd')}</label>
          <input
            id="tag"
            type="text"
            list="tag-suggestions"
            placeholder="env:prod"
            autocomplete="off"
            spellcheck="false"
            ?disabled=${this.busy}
            .value=${this.tag}
            @input=${(event: Event) => (this.tag = (event.currentTarget as HTMLInputElement).value)}
          />
          ${datalist}
        </div>`;
      case 'remove':
        return html`<div class="field">
          <label for="tag">${t('tagDialog.tagToRemove')}</label>
          <select
            id="tag"
            ?disabled=${this.busy}
            .value=${this.tag}
            @change=${(event: Event) => (this.tag = (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">${t('tagDialog.amongSelection')}</option>
            ${this.present.map((tag) => html`<option value=${tag} ?selected=${tag === this.tag}>${tag}</option>`)}
          </select>
        </div>`;
      case 'rename':
        return html`<div class="row fields">
          <div class="field">
            <label for="from">${t('tagDialog.currentTag')}</label>
            <select
              id="from"
              ?disabled=${this.busy}
              .value=${this.from}
              @change=${(event: Event) => (this.from = (event.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">${t('tagDialog.amongSelection')}</option>
              ${this.present.map((tag) => html`<option value=${tag} ?selected=${tag === this.from}>${tag}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="to">${t('tagDialog.newTag')}</label>
            <input
              id="to"
              type="text"
              list="tag-suggestions"
              placeholder="env:qua"
              autocomplete="off"
              spellcheck="false"
              ?disabled=${this.busy}
              .value=${this.to}
              @input=${(event: Event) => (this.to = (event.currentTarget as HTMLInputElement).value)}
            />
            ${datalist}
          </div>
        </div>`;
    }
  }

  private renderPlan(plan: TagStep[]) {
    if (plan.length === 0) {
      return html`<p class="muted small">
        ${this.operation == null ? t('tagDialog.chooseTag') : t('tagDialog.nothingToDo')}
      </p>`;
    }
    const skipped = this.resources.length - new Set(plan.map((step) => step.resource.id)).size;
    return html`<div class="plan">
      <p class="small">
        <strong>${t('tagDialog.calls', { count: plan.length })}</strong>
        ${skipped > 0 ? html`<span class="muted">${t('tagDialog.alreadyUpToDate', { count: skipped })}</span>` : nothing}
      </p>
      <ul class="small">
        ${plan.slice(0, MAX_PREVIEW).map(
          (step) =>
            html`<li>
              <span class="op ${step.action}">${step.action === 'add' ? '+' : '−'}${step.tag}</span>
              <span class="muted">${step.resource.kind === 'app' ? t('tagDialog.app') : t('tagDialog.addon')}</span>
              ${step.resource.name}
            </li>`,
        )}
        ${plan.length > MAX_PREVIEW ? html`<li class="muted">${t('tagDialog.more', { count: plan.length - MAX_PREVIEW })}</li>` : nothing}
      </ul>
      <div class="cli-block">
        <span class="muted small">${t('tagDialog.apiEquivalent')}</span>
        <cvc-cli
          block
          .command=${`${describeStep(plan[0], this.ownerId)}${plan.length > 1 ? `\n… × ${plan.length}` : ''}`}
          .script=${plan.map((step) => describeStep(step, this.ownerId)).join('\n')}
          .count=${plan.length}
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
      .seg {
        display: inline-flex;
        gap: 0.15rem;
      }
      .seg button {
        padding: 0.25rem 0.7rem;
        border-radius: 999px;
        font-size: 0.85rem;
        background: transparent;
      }
      .seg button.on {
        background: var(--cvc-text);
        color: var(--cvc-bg);
        border-color: transparent;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        flex: 1;
      }
      .field label {
        font-size: 0.9rem;
        font-weight: 500;
      }
      .fields {
        align-items: flex-start;
      }
      .plan ul {
        margin: 0.3rem 0 0.6rem;
        padding: 0;
        list-style: none;
        max-height: 30vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .plan li {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
      }
      .op {
        font-family: var(--cvc-mono);
        font-size: 0.85em;
      }
      .op.add {
        color: var(--cvc-ok);
      }
      .op.remove {
        color: var(--cvc-danger);
      }
      .cli-block {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }

      footer {
        justify-content: flex-end;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-tag-dialog': CvcTagDialog;
  }
}
