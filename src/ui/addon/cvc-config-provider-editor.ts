import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  addRow,
  configProviderCommands,
  draftProblems,
  draftVariables,
  hasChanges,
  mergeVariables,
  startDraft,
  toggleRemoved,
  updateRow,
  variableChanges,
  type DraftRow,
  type Variable,
} from '../../core/addons/config-provider.js';
import { t } from '../../core/i18n.js';
import { parseEnvFile, type ApplicationSummary } from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { sharedStyles } from '../shared/styles.js';

export interface VariablesApplyDetail {
  /** The variables the editing started from, to check nobody changed them since. */
  before: Variable[];
  after: Variable[];
}

/**
 * The variables of a configuration provider as a draft: rows to rename,
 * change, strike out or add, a `.env` to paste in. Beside it, what changes,
 * the clever-tools commands that would do the same, and the applications
 * Clever Cloud will redeploy. Emits `cvc-variables-apply` or
 * `cvc-variables-cancel`; the tab does the writing.
 */
@customElement('cvc-config-provider-editor')
export class CvcConfigProviderEditor extends CvcElement {
  @property() addonId = '';
  @property({ attribute: false }) variables: Variable[] = [];
  @property({ attribute: false }) linkedApps: ApplicationSummary[] = [];
  @property({ type: Boolean }) busy = false;
  @property({ attribute: false }) error: string | null = null;

  @state() private draft: DraftRow[] = [];
  @state() private pasting = false;
  @state() private pasted = '';
  @state() private pasteError: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('variables')) {
      this.draft = startDraft(this.variables);
    }
  }

  private edit(key: string, patch: Partial<Variable>): void {
    this.draft = updateRow(this.draft, key, patch);
  }

  private merge(): void {
    const { variables, errors } = parseEnvFile(this.pasted);
    if (errors.length > 0) {
      this.pasteError = errors.join('\n');
      return;
    }
    this.draft = mergeVariables(this.draft, variables);
    this.pasted = '';
    this.pasteError = null;
    this.pasting = false;
  }

  private apply(): void {
    this.emit<VariablesApplyDetail>('cvc-variables-apply', {
      before: this.variables,
      after: draftVariables(this.draft),
    });
  }

  override render() {
    const problems = draftProblems(this.draft);
    const changes = variableChanges(this.variables, draftVariables(this.draft));
    const changed = hasChanges(changes);
    return html`
      <section class="card table">
        <table>
          <thead>
            <tr>
              <th>${t('env.name')}</th>
              <th>${t('env.value')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${this.draft.map((row) => this.renderRow(row, problems.find((problem) => problem.key === row.key)?.kind))}
          </tbody>
        </table>
        <div class="row tools">
          <button
            type="button"
            class="ghost small"
            ?disabled=${this.busy}
            @click=${() => (this.draft = addRow(this.draft))}
          >
            + ${t('cpEdit.add')}
          </button>
          <button
            type="button"
            class="ghost small"
            aria-expanded=${this.pasting}
            ?disabled=${this.busy}
            @click=${() => (this.pasting = !this.pasting)}
          >
            ${t('cpEdit.paste')}
          </button>
        </div>
        ${
          this.pasting
            ? html`<div class="paste">
                <textarea
                  class="mono"
                  rows="6"
                  placeholder="NAME=value"
                  aria-label=${t('cpEdit.paste')}
                  .value=${this.pasted}
                  @input=${(event: Event) => (this.pasted = (event.target as HTMLTextAreaElement).value)}
                ></textarea>
                ${this.pasteError ? html`<p class="error small" role="alert">${this.pasteError}</p>` : nothing}
                <div class="row">
                  <button type="button" class="small" ?disabled=${this.pasted.trim() === ''} @click=${this.merge}>
                    ${t('cpEdit.merge')}
                  </button>
                  <span class="muted small">${t('cpEdit.mergeHint')}</span>
                </div>
              </div>`
            : nothing
        }
      </section>
      <section class="card summary">
        <h3>${t('cpEdit.changes')}</h3>
        ${
          changed
            ? html`<p>
                  ${t('cpEdit.counts', {
                    added: changes.added.length,
                    changed: changes.changed.length,
                    removed: changes.removed.length,
                  })}
                </p>
                <p class="muted small">${t('cpEdit.cliEquivalent')}</p>
                <cvc-cli
                  block
                  .command=${configProviderCommands(this.addonId, changes).join('\n')}
                  .count=${changes.added.length + changes.changed.length + changes.removed.length}
                ></cvc-cli>
                <p class="small redeploy">
                  ${
                    this.linkedApps.length === 0
                      ? t('cpEdit.noRedeploy')
                      : html`${t('cpEdit.redeploy', { count: this.linkedApps.length })}
                          <strong>${this.linkedApps.map((app) => app.name).join(', ')}</strong>`
                  }
                </p>`
            : html`<p class="muted small">${t('cpEdit.noChange')}</p>`
        }
        ${problems.length > 0 ? html`<p class="error small" role="alert">${t('cpEdit.problems')}</p>` : nothing}
        ${this.error ? html`<p class="error small" role="alert">${this.error}</p>` : nothing}
        <footer class="row">
          <button
            type="button"
            class="primary"
            ?disabled=${!changed || problems.length > 0 || this.busy}
            @click=${this.apply}
          >
            ${this.busy ? t('cpEdit.applying') : t('cpEdit.apply')}
          </button>
          <button type="button" class="ghost" ?disabled=${this.busy} @click=${() => this.emit('cvc-variables-cancel')}>
            ${t('common.cancel')}
          </button>
        </footer>
      </section>
    `;
  }

  private renderRow(row: DraftRow, problem: 'name' | 'duplicate' | undefined) {
    const state = row.removed
      ? 'removed'
      : row.original == null
        ? 'added'
        : row.original.name !== row.name.trim() || row.original.value !== row.value
          ? 'changed'
          : '';
    const lines = Math.min(Math.max(row.value.split('\n').length, 1), 6);
    return html`<tr class=${state}>
      <td class="name">
        <input
          class="mono"
          .value=${row.name}
          ?disabled=${row.removed || this.busy}
          aria-label=${t('env.name')}
          aria-invalid=${problem != null}
          title=${problem == null ? '' : t(problem === 'name' ? 'cpEdit.badName' : 'cpEdit.duplicate')}
          @input=${(event: Event) => this.edit(row.key, { name: (event.target as HTMLInputElement).value })}
        />
      </td>
      <td class="value">
        <textarea
          class="mono"
          rows=${lines}
          .value=${row.value}
          ?disabled=${row.removed || this.busy}
          aria-label=${t('env.value')}
          @input=${(event: Event) => this.edit(row.key, { value: (event.target as HTMLTextAreaElement).value })}
        ></textarea>
      </td>
      <td class="actions">
        <button
          type="button"
          class="ghost small"
          ?disabled=${this.busy}
          @click=${() => (this.draft = toggleRemoved(this.draft, row.key))}
        >
          ${row.removed ? t('cpEdit.keep') : t('common.remove')}
        </button>
      </td>
    </tr>`;
  }

  private emit<T>(name: string, detail?: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }));
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .card.table {
        padding: 0.25rem 0.5rem 0.6rem;
        overflow-x: auto;
      }
      td {
        vertical-align: top;
      }
      td.name {
        width: 30%;
      }
      td.name input,
      td.value textarea {
        width: 100%;
        box-sizing: border-box;
        font-size: 0.85rem;
        padding: 0.3rem 0.5rem;
      }
      td.value textarea {
        resize: vertical;
        min-height: 2rem;
      }
      td.actions {
        width: 1%;
        white-space: nowrap;
      }
      input[aria-invalid='true'] {
        border-color: var(--cvc-danger);
      }
      tr.added td:first-child {
        box-shadow: inset 3px 0 0 var(--cvc-ok);
      }
      tr.changed td:first-child {
        box-shadow: inset 3px 0 0 var(--cvc-accent);
      }
      tr.removed input,
      tr.removed textarea {
        text-decoration: line-through;
        opacity: 0.6;
      }
      button.small {
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
      }
      .tools {
        gap: 0.4rem;
        margin-top: 0.5rem;
      }
      .paste {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-top: 0.5rem;
      }
      .paste textarea {
        width: 100%;
        box-sizing: border-box;
        font-size: 0.85rem;
      }
      .paste .row {
        gap: 0.6rem;
      }
      .summary {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .summary h3,
      .summary p {
        margin: 0;
      }
      footer {
        gap: 0.5rem;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-config-provider-editor': CvcConfigProviderEditor;
  }
  interface HTMLElementEventMap {
    'cvc-variables-apply': CustomEvent<VariablesApplyDetail>;
    'cvc-variables-cancel': CustomEvent<undefined>;
  }
}
