import { css, html, nothing, type PropertyValues } from 'lit';
import { t } from '../core/i18n.js';
import { CvcElement } from './shared/cvc-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  ActionContext,
  ActionDefinition,
  ActionField,
  ActionResult,
  ActionValue,
  ActionValues,
} from '../core/actions.js';
import { describeError } from '../core/clever-client.js';
import './shared/cvc-cli.js';
import { sharedStyles } from './shared/styles.js';

/**
 * The form of one action, generated from its field list, with the equivalent
 * `clever` command rendered live from the current values.
 */
@customElement('cvc-action-dialog')
export class CvcActionDialog extends CvcElement {
  @property({ attribute: false }) action!: ActionDefinition;
  @property({ attribute: false }) context!: ActionContext;
  @property({ attribute: false }) prefill: ActionValues = {};

  @state() private fields: ActionField[] = [];
  @state() private values: ActionValues = {};
  @state() private busy = false;
  @state() private error: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('action') || changed.has('context') || changed.has('prefill')) {
      this.fields = this.action.fields(this.context, this.prefill);
      const values: ActionValues = {};
      for (const field of this.fields) {
        const prefilled = this.prefill[field.name];
        values[field.name] =
          prefilled ?? field.default ?? (field.type === 'checkbox' ? false : (field.options?.[0]?.value ?? ''));
      }
      this.values = values;
      this.error = null;
    }
  }

  override firstUpdated(): void {
    const first = this.renderRoot.querySelector<HTMLElement>('input, select, textarea, button.primary, button.danger');
    first?.focus();
    // A prefilled text (a name to change) is selected, so typing replaces it.
    if (first instanceof HTMLInputElement && first.type === 'text') {
      first.select();
    }
  }

  private setValue(name: string, value: ActionValue): void {
    this.values = { ...this.values, [name]: value };
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('cvc-action-close', { bubbles: true, composed: true }));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  private validate(): string | null {
    for (const field of this.fields) {
      const value = this.values[field.name];
      const text = value == null ? '' : String(value).trim();
      if (field.required && text === '') {
        return t('dialog.required', { field: field.label });
      }
      if (field.type === 'number' && text !== '') {
        const parsed = Number(text);
        if (!Number.isInteger(parsed)) {
          return t('dialog.integer', { field: field.label });
        }
        if (field.min != null && parsed < field.min) {
          return t('dialog.min', { field: field.label, min: field.min });
        }
        if (field.max != null && parsed > field.max) {
          return t('dialog.max', { field: field.label, max: field.max });
        }
      }
      if (field.pattern != null && text !== '' && !field.pattern.test(text)) {
        return t('dialog.pattern', { field: field.label, help: field.patternHelp ?? t('dialog.invalidFormat') });
      }
    }
    return null;
  }

  private async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const invalid = this.validate();
    if (invalid != null) {
      this.error = invalid;
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      const result = await this.action.run(this.context, this.values);
      this.dispatchEvent(
        new CustomEvent<ActionResult>('cvc-action-done', { detail: result, bubbles: true, composed: true }),
      );
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.busy = false;
    }
  }

  override render() {
    const action = this.action;
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <form class="dialog" role="dialog" aria-labelledby="title" @submit=${this.submit} @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t(action.title)}</h2>
          ${action.description ? html`<p class="muted small">${t(action.description)}</p>` : nothing}
        </header>
        ${this.renderConsequences()}
        ${
          this.fields.length === 0 && action.danger
            ? html`<p>
                ${t('dialog.confirmBefore')}
                <strong>${this.context.app?.name ?? this.context.appId}</strong>${t('dialog.confirmAfter')}
              </p>`
            : nothing
        }
        ${this.fields.map((field) => this.renderField(field))}

        <div class="cli-block">
          <span class="muted small">${t('common.cliEquivalent')}</span>
          <cvc-cli block .command=${action.cli(this.context, this.values)}></cvc-cli>
        </div>

        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}

        <footer class="row">
          <button type="button" class="ghost" @click=${this.close} ?disabled=${this.busy}>${t('common.cancel')}</button>
          <button
            type="submit"
            class=${action.danger ? 'danger' : 'primary'}
            ?disabled=${this.busy || action.ready?.(this.context, this.values) === false}
          >
            ${this.busy ? t('common.busy') : t(action.submitLabel ?? 'dialog.run')}
          </button>
        </footer>
      </form>
    `;
  }

  /** What a deletion takes with it (#31). */
  private renderConsequences() {
    const lines = this.action.consequences?.(this.context) ?? [];
    return lines.length === 0
      ? nothing
      : html`<ul class="consequences small">
          ${lines.map((line) => html`<li>${line}</li>`)}
        </ul>`;
  }

  private renderField(field: ActionField) {
    const value = this.values[field.name];
    const id = `field-${field.name}`;
    const classes = field.mono ? 'mono' : '';
    let control;
    switch (field.type) {
      case 'checkbox':
        return html`<label class="row checkbox">
          <input
            type="checkbox"
            .checked=${Boolean(value)}
            @change=${(event: Event) => this.setValue(field.name, (event.currentTarget as HTMLInputElement).checked)}
          />
          ${field.label} ${field.help ? html`<span class="muted small">${field.help}</span>` : nothing}
        </label>`;
      case 'select':
        control = html`<select
          id=${id}
          class=${classes}
          .value=${String(value ?? '')}
          @change=${(event: Event) => this.setValue(field.name, (event.currentTarget as HTMLSelectElement).value)}
        >
          ${(field.options ?? []).map(
            (option) =>
              html`<option value=${option.value} ?selected=${option.value === value}>${option.label}</option>`,
          )}
        </select>`;
        break;
      case 'textarea':
        control = html`<textarea
          id=${id}
          class=${classes}
          rows=${field.rows ?? 4}
          placeholder=${field.placeholder ?? ''}
          .value=${String(value ?? '')}
          @input=${(event: Event) => this.setValue(field.name, (event.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>`;
        break;
      case 'number':
        control = html`<input
          id=${id}
          type="number"
          min=${field.min ?? nothing}
          max=${field.max ?? nothing}
          step="1"
          .value=${String(value ?? '')}
          @input=${(event: Event) => this.setValue(field.name, Number((event.currentTarget as HTMLInputElement).value))}
        />`;
        break;
      default:
        control = html`<input
          id=${id}
          type="text"
          class=${classes}
          autocomplete="off"
          spellcheck="false"
          placeholder=${field.placeholder ?? ''}
          .value=${String(value ?? '')}
          @input=${(event: Event) => this.setValue(field.name, (event.currentTarget as HTMLInputElement).value)}
        />`;
    }
    return html`<div class="field">
      <label for=${id}>${field.label}${field.required ? html` <span class="muted">*</span>` : nothing}</label>
      ${control} ${field.help ? html`<span class="muted small">${field.help}</span>` : nothing}
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
        top: 10vh;
        left: 50%;
        transform: translateX(-50%);
        width: min(560px, calc(100vw - 2rem));
        max-height: 80vh;
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
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .field label {
        font-size: 0.9rem;
        font-weight: 500;
      }
      textarea {
        resize: vertical;
        min-height: 2.5rem;
      }
      label.checkbox {
        gap: 0.5rem;
      }
      .consequences {
        margin: 0;
        padding-left: 1.2rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .cli-block {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }

      footer {
        justify-content: flex-end;
      }
      button.danger {
        background: var(--cvc-danger);
        color: var(--cvc-accent-text);
        border-color: transparent;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-action-dialog': CvcActionDialog;
  }
}
