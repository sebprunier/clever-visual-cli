import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../../core/clever-client.js';
import {
  apiExecutor,
  describeStep,
  planTagEdit,
  runSteps,
  validateTag,
  type TagResource,
  type TagStep,
} from '../../core/home/tagging.js';
import { t } from '../../core/i18n.js';
import type { TagsAppliedDetail } from '../cvc-tag-dialog.js';
import './cvc-cli.js';
import { CvcElement } from './cvc-element.js';
import { sharedStyles } from './styles.js';

/**
 * The tags of one application or add-on: remove some, add others, see the
 * calls, apply. Emits `cvc-tags-applied` with the result, or `cvc-tag-close`,
 * as the bulk dialog of the home page.
 */
@customElement('cvc-tag-edit-dialog')
export class CvcTagEditDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property({ attribute: false }) resource!: TagResource;
  /** Tags in use in the organisation, suggested while typing. */
  @property({ attribute: false }) suggestions: string[] = [];

  /** The tags as they will be: the current ones minus the removed, plus the added. */
  @state() private next: string[] = [];
  @state() private draft = '';
  @state() private invalid: string | null = null;
  @state() private busy = false;
  @state() private progress = 0;
  @state() private error: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    // The page hands a fresh object on every render: only another resource resets the edits.
    if (changed.has('resource') && (changed.get('resource') as TagResource | undefined)?.id !== this.resource.id) {
      this.next = [...this.resource.tags];
    }
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLInputElement>('#new-tag')?.focus();
  }

  private get plan(): TagStep[] {
    return planTagEdit(this.resource, this.next);
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

  /** Enter in the field adds the tag typed; on an empty field it applies, as a form does. */
  private onDraftKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && this.draft.trim() !== '') {
      event.preventDefault();
      this.add();
    }
  }

  private add(): void {
    const tag = this.draft.trim();
    this.invalid = validateTag(tag);
    if (this.invalid != null) {
      return;
    }
    if (!this.next.includes(tag)) {
      this.next = [...this.next, tag];
    }
    this.draft = '';
  }

  private toggle(tag: string): void {
    this.next = this.next.includes(tag) ? this.next.filter((other) => other !== tag) : [...this.next, tag];
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
    const plan = this.plan;
    const current = this.resource.tags;
    const added = this.next.filter((tag) => !current.includes(tag));
    const suggestions = this.suggestions.filter((tag) => !this.next.includes(tag));
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <form class="dialog" role="dialog" aria-labelledby="title" @submit=${this.submit} @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t('tagEdit.title', { name: this.resource.name })}</h2>
          <p class="muted small">${t('tagDialog.convention')}</p>
        </header>
        ${
          current.length === 0 && added.length === 0
            ? html`<p class="muted small">${t('tags.none')}</p>`
            : html`<ul class="chips">
                ${current.map((tag) => {
                  const kept = this.next.includes(tag);
                  return html`<li class="chip ${kept ? '' : 'removed'}">
                    <span>${tag}</span>
                    <button
                      type="button"
                      class="x"
                      ?disabled=${this.busy}
                      title=${t(kept ? 'tagEdit.remove' : 'tagEdit.keep', { tag })}
                      aria-label=${t(kept ? 'tagEdit.remove' : 'tagEdit.keep', { tag })}
                      @click=${() => this.toggle(tag)}
                    >
                      ${kept ? '×' : '↺'}
                    </button>
                  </li>`;
                })}
                ${added.map(
                  (tag) =>
                    html`<li class="chip added">
                      <span>${tag}</span>
                      <button
                        type="button"
                        class="x"
                        ?disabled=${this.busy}
                        title=${t('tagEdit.remove', { tag })}
                        aria-label=${t('tagEdit.remove', { tag })}
                        @click=${() => this.toggle(tag)}
                      >
                        ×
                      </button>
                    </li>`,
                )}
              </ul>`
        }
        <div class="field">
          <label for="new-tag">${t('tagDialog.newTag')}</label>
          <div class="row">
            <input
              id="new-tag"
              type="text"
              list="tag-suggestions"
              placeholder="env:prod"
              autocomplete="off"
              spellcheck="false"
              ?disabled=${this.busy}
              .value=${this.draft}
              @input=${(event: Event) => {
                this.draft = (event.currentTarget as HTMLInputElement).value;
                this.invalid = null;
              }}
              @keydown=${this.onDraftKeyDown}
            />
            <button type="button" ?disabled=${this.busy || this.draft.trim() === ''} @click=${this.add}>
              ${t('tagEdit.add')}
            </button>
          </div>
          <datalist id="tag-suggestions">
            ${suggestions.map((suggestion) => html`<option value=${suggestion}></option>`)}
          </datalist>
        </div>
        ${this.invalid != null ? html`<p class="error small" role="alert">${this.invalid}</p>` : nothing}
        ${
          plan.length === 0
            ? html`<p class="muted small">${t('tagEdit.unchanged')}</p>`
            : html`<div class="cli-block">
                <span class="small"
                  ><strong>${t('tagDialog.calls', { count: plan.length })}</strong>
                  <span class="muted">· ${t('tagDialog.apiEquivalent')}</span></span
                >
                <cvc-cli
                  block
                  .command=${plan.map((step) => describeStep(step, this.ownerId)).join('\n')}
                  .count=${plan.length}
                ></cvc-cli>
              </div>`
        }
        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
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
      ul.chips {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        padding: 0.1rem 0.15rem 0.1rem 0.55rem;
        font-size: 0.85rem;
        border-radius: 999px;
        color: var(--cvc-info);
        background: color-mix(in srgb, var(--cvc-info) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--cvc-info) 30%, transparent);
      }
      .chip.added {
        color: var(--cvc-ok);
        background: color-mix(in srgb, var(--cvc-ok) 10%, transparent);
        border-color: color-mix(in srgb, var(--cvc-ok) 35%, transparent);
      }
      .chip.removed {
        color: var(--cvc-muted);
        background: transparent;
        border-style: dashed;
        border-color: var(--cvc-border);
      }
      .chip.removed span {
        text-decoration: line-through;
      }
      .chip .x {
        padding: 0 0.35rem;
        border: none;
        background: none;
        color: inherit;
        font-size: 1rem;
        line-height: 1;
        border-radius: 999px;
      }
      .chip .x:hover {
        background: color-mix(in srgb, currentColor 15%, transparent);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .field label {
        font-size: 0.9rem;
        font-weight: 500;
      }
      .field input {
        flex: 1;
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
    'cvc-tag-edit-dialog': CvcTagEditDialog;
  }
}
