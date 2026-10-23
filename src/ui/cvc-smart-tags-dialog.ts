import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { describeError } from '../core/clever-client.js';
import {
  planSmartTags,
  suggestSmartTags,
  type SmartTagContext,
  type SmartTagProposal,
  type SmartTagReason,
  type SmartTagResource,
  type SmartTagSuggestion,
} from '../core/home/smart-tags.js';
import { apiExecutor, describeStep, runSteps, tagsOf, validateTag, type TagStep } from '../core/home/tagging.js';
import { t } from '../core/i18n.js';
import type { TagsAppliedDetail } from './cvc-tag-dialog.js';
import './shared/cvc-cli.js';
import { CvcElement } from './shared/cvc-element.js';
import { sharedStyles } from './shared/styles.js';

/** A proposed tag across the selection: how many resources it goes to, how many of them it is picked for. */
interface Proposed {
  tag: string;
  count: number;
  picked: number;
  reasons: string[];
}

const MAX_REASONS = 3;

/** Why a tag is proposed, in a few words. */
function reasonText(reason: SmartTagReason): string {
  switch (reason.kind) {
    case 'env':
      return t('smartTags.reason.env', { word: reason.word });
    case 'known':
      return t('smartTags.reason.known');
    case 'shared':
      return t('smartTags.reason.shared', { count: reason.count });
    case 'close':
      return t('smartTags.reason.close', { words: reason.words });
    case 'rest':
      return t('smartTags.reason.rest');
    case 'like':
      return t('smartTags.reason.like', {
        names: `${reason.names.join(', ')}${reason.count > reason.names.length ? ` +${reason.count - reason.names.length}` : ''}`,
        count: reason.count,
      });
    case 'linked':
      return t('smartTags.reason.linked', { names: reason.names.join(', ') });
    case 'project':
      return t('smartTags.reason.project', { project: reason.project });
  }
}

const pickKey = (resourceId: string, tag: string) => `${resourceId}\n${tag}`;

/**
 * Smart tags for the selected resources: tags read from their names, the
 * selection taken as a whole (see `core/home/smart-tags.ts`). Each proposed
 * tag can be dropped or renamed for the whole selection, or toggled resource
 * by resource; the exact additions and the HTTP calls show before applying.
 * Emits `cvc-tags-applied` with the result, as the tag dialog does, or
 * `cvc-tag-close`.
 */
@customElement('cvc-smart-tags-dialog')
export class CvcSmartTagsDialog extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property({ attribute: false }) resources: SmartTagResource[] = [];
  @property({ attribute: false }) context: SmartTagContext = { resources: [], links: {} };

  @state() private suggestions: SmartTagSuggestion[] = [];
  /** What the user changed from the default picks, by resource and proposed tag. */
  @state() private picks: ReadonlyMap<string, boolean> = new Map();
  /** Proposed tags renamed for the whole selection. */
  @state() private renames: Readonly<Record<string, string>> = {};
  @state() private busy = false;
  @state() private progress = 0;
  @state() private error: string | null = null;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('resources') || changed.has('context')) {
      this.suggestions = suggestSmartTags(this.resources, this.context);
    }
  }

  override firstUpdated(): void {
    // The first thing in the form, so that Escape reaches it; the proposed tags start folded.
    this.renderRoot.querySelector<HTMLElement>('summary, button.ghost')?.focus();
  }

  private isPicked(resourceId: string, proposal: SmartTagProposal): boolean {
    return this.picks.get(pickKey(resourceId, proposal.tag)) ?? proposal.picked;
  }

  private renamed(tag: string): string {
    return this.renames[tag] ?? tag;
  }

  private get proposed(): Proposed[] {
    const byTag = new Map<string, Proposed>();
    for (const { resource, proposals } of this.suggestions) {
      for (const proposal of proposals) {
        const entry = byTag.get(proposal.tag) ?? { tag: proposal.tag, count: 0, picked: 0, reasons: [] };
        entry.count += 1;
        entry.picked += this.isPicked(resource.id, proposal) ? 1 : 0;
        const reason = reasonText(proposal.reason);
        if (!entry.reasons.includes(reason)) {
          entry.reasons.push(reason);
        }
        byTag.set(proposal.tag, entry);
      }
    }
    return [...byTag.values()];
  }

  private get plan(): TagStep[] {
    const byKey = new Map(
      this.suggestions.flatMap(({ resource, proposals }) =>
        proposals.map((proposal) => [pickKey(resource.id, proposal.tag), proposal] as const),
      ),
    );
    return planSmartTags(
      this.suggestions,
      (resourceId, tag) => {
        const proposal = byKey.get(pickKey(resourceId, tag));
        return proposal != null && this.isPicked(resourceId, proposal);
      },
      (tag) => this.renamed(tag),
    );
  }

  /** Picks or drops a proposed tag for every resource it is proposed to. */
  private pickAll(tag: string, picked: boolean): void {
    const next = new Map(this.picks);
    for (const { resource, proposals } of this.suggestions) {
      if (proposals.some((proposal) => proposal.tag === tag)) {
        next.set(pickKey(resource.id, tag), picked);
      }
    }
    this.picks = next;
  }

  private toggle(resourceId: string, proposal: SmartTagProposal): void {
    this.picks = new Map(this.picks).set(pickKey(resourceId, proposal.tag), !this.isPicked(resourceId, proposal));
  }

  private rename(tag: string, value: string): void {
    this.renames = { ...this.renames, [tag]: value };
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
    const proposed = this.proposed;
    const plan = this.plan;
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <form class="dialog" role="dialog" aria-labelledby="title" @submit=${this.submit} @keydown=${this.onKeyDown}>
        <header>
          <h2 id="title">${t('smartTags.title')}</h2>
          <p class="muted small">
            ${t('tagDialog.selected', { count: this.resources.length, apps, addons })} ${t('smartTags.intro')}
          </p>
        </header>
        ${
          proposed.length === 0
            ? html`<p class="muted">${t('smartTags.nothing')}</p>`
            : html`${this.renderProposed(proposed)} ${this.renderResources()} ${this.renderPlan(plan)}`
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

  private renderProposed(proposed: Proposed[]) {
    return html`<details class="proposed-tags">
      <summary>
        <h3>${t('smartTags.proposed')}</h3>
        <span class="muted small">
          ${t('smartTags.proposedSummary', {
            count: proposed.length,
            picked: proposed.filter(({ picked }) => picked > 0).length,
          })}
        </span>
      </summary>
      <datalist id="tag-suggestions">
        ${tagsOf(this.context.resources).map((tag) => html`<option value=${tag}></option>`)}
      </datalist>
      <ul class="proposed">
        ${proposed.map(({ tag, count, picked, reasons }) => {
          const value = this.renamed(tag);
          const problem = validateTag(value);
          return html`<li>
            <input
              type="checkbox"
              aria-label=${t('smartTags.pickAll', { tag: value, count })}
              ?disabled=${this.busy}
              .checked=${picked === count}
              .indeterminate=${picked > 0 && picked < count}
              @change=${(event: Event) => this.pickAll(tag, (event.currentTarget as HTMLInputElement).checked)}
            />
            <input
              type="text"
              class="mono value"
              list="tag-suggestions"
              aria-label=${t('smartTags.renameAria', { tag })}
              title=${t('smartTags.renameTitle')}
              autocomplete="off"
              spellcheck="false"
              ?disabled=${this.busy}
              .value=${value}
              @input=${(event: Event) => this.rename(tag, (event.currentTarget as HTMLInputElement).value)}
            />
            <span class="small count">${t('smartTags.count', { picked, count })}</span>
            <span class="muted small why">
              ${reasons.slice(0, MAX_REASONS).join(' · ')}${reasons.length > MAX_REASONS ? ' …' : ''}
            </span>
            ${problem != null ? html`<span class="error small" role="alert">${problem}</span>` : nothing}
          </li>`;
        })}
      </ul>
    </details>`;
  }

  private renderResources() {
    const empty = this.suggestions.filter(({ proposals }) => proposals.length === 0);
    return html`<section>
      <h3>${t('smartTags.byResource')}</h3>
      <ul class="resources">
        ${this.suggestions
          .filter(({ proposals }) => proposals.length > 0)
          .map(
            ({ resource, proposals }) =>
              html`<li>
                <span class="muted small kind">
                  ${resource.kind === 'app' ? t('tagDialog.app') : t('tagDialog.addon')}
                </span>
                <span class="name">${resource.name}</span>
                <span class="chips">
                  ${proposals.map((proposal) => {
                    const picked = this.isPicked(resource.id, proposal);
                    const reason = reasonText(proposal.reason);
                    return html`<button
                      type="button"
                      class="chip ${picked ? 'on' : ''}"
                      aria-pressed=${picked}
                      title=${
                        proposal.conflict == null
                          ? reason
                          : `${reason} · ${t('smartTags.conflict', { tag: proposal.conflict })}`
                      }
                      ?disabled=${this.busy}
                      @click=${() => this.toggle(resource.id, proposal)}
                    >
                      ${this.renamed(proposal.tag)}${proposal.conflict != null ? html` <span aria-hidden="true">≠</span>` : nothing}
                    </button>`;
                  })}
                </span>
              </li>`,
          )}
      </ul>
      ${
        empty.length > 0
          ? html`<p class="muted small">
              ${t('smartTags.nothingFor', { names: empty.map(({ resource }) => resource.name).join(', ') })}
            </p>`
          : nothing
      }
    </section>`;
  }

  private renderPlan(plan: TagStep[]) {
    if (plan.length === 0) {
      return html`<p class="muted small">${t('smartTags.nothingPicked')}</p>`;
    }
    return html`<div class="plan">
      <p class="small"><strong>${t('tagDialog.calls', { count: plan.length })}</strong></p>
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
        top: 6vh;
        left: 50%;
        transform: translateX(-50%);
        width: min(760px, calc(100vw - 2rem));
        max-height: 88vh;
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
      h3 {
        margin: 0 0 0.4rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .proposed-tags summary {
        cursor: pointer;
        width: fit-content;
      }
      .proposed-tags summary h3 {
        display: inline;
        margin-right: 0.4rem;
      }
      .proposed-tags[open] summary {
        margin-bottom: 0.4rem;
      }
      ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
      }
      .proposed {
        gap: 0.35rem;
      }
      .proposed li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem 0.6rem;
      }
      .proposed input[type='checkbox'] {
        margin: 0;
      }
      .value {
        width: 16rem;
        padding: 0.25rem 0.5rem;
        font-size: 0.85rem;
      }
      .count {
        min-width: 3.5rem;
      }
      .why {
        flex: 1;
        min-width: 12rem;
      }
      .resources {
        gap: 0.2rem;
        max-height: 34vh;
        overflow: auto;
        padding-right: 0.25rem;
      }
      .resources li {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.2rem 0.5rem;
        padding: 0.2rem 0;
        border-bottom: 1px solid var(--cvc-border);
      }
      .resources li:last-child {
        border-bottom: none;
      }
      .kind {
        min-width: 3.5rem;
      }
      .name {
        font-weight: 500;
        margin-right: auto;
      }
      .chips {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.3rem;
      }
      .chip {
        padding: 0 0.5rem;
        font-family: var(--cvc-mono);
        font-size: 0.75rem;
        line-height: 1.5;
        border-radius: 999px;
        color: var(--cvc-muted);
        background: transparent;
        border: 1px dashed var(--cvc-border);
        text-decoration: line-through;
      }
      .chip.on {
        color: var(--cvc-ok);
        background: color-mix(in srgb, var(--cvc-ok) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--cvc-ok) 35%, transparent);
        text-decoration: none;
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
    'cvc-smart-tags-dialog': CvcSmartTagsDialog;
  }
}
