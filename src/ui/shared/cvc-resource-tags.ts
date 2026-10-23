import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TagResource } from '../../core/home/tagging.js';
import { t } from '../../core/i18n.js';
import type { TagsAppliedDetail } from '../cvc-tag-dialog.js';
import { CvcElement } from './cvc-element.js';
import { ICON_EDIT } from './icons.js';
import './cvc-tag-edit-dialog.js';
import { sharedStyles } from './styles.js';
import { announceTagResult } from './tag-result.js';

/**
 * The tags of an application or add-on under its name, and the button that
 * edits them. An add-on also shows, dashed, the tags it inherits from its
 * linked applications for grouping; those change on the applications.
 */
@customElement('cvc-resource-tags')
export class CvcResourceTags extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property({ attribute: false }) resource: TagResource | null = null;
  @property({ attribute: false }) inherited: Array<{ tag: string; from: string[] }> = [];
  /** Tags in use in the organisation, suggested while typing. */
  @property({ attribute: false }) suggestions: string[] = [];

  @state() private editing = false;

  private onApplied(event: CustomEvent<TagsAppliedDetail>): void {
    event.stopPropagation();
    this.editing = false;
    announceTagResult(this, this.client, this.ownerId, event.detail.result);
  }

  override render() {
    const resource = this.resource;
    if (resource == null) {
      return nothing;
    }
    const empty = resource.tags.length === 0 && this.inherited.length === 0;
    return html`
      <div class="tags">
        ${resource.tags.map((tag) => html`<span class="tag">${tag}</span>`)}
        ${this.inherited.map(
          (entry) =>
            html`<span class="tag inherited" title=${t('tags.inheritedTitle', { apps: entry.from.join(', ') })}
              >${entry.tag}</span
            >`,
        )}
        ${empty ? html`<span class="muted small">${t('tags.none')}</span>` : nothing}
        <button
          type="button"
          class="edit"
          title=${resource.tags.length === 0 ? t('tags.add') : t('tags.edit')}
          aria-label=${resource.tags.length === 0 ? t('tags.add') : t('tags.edit')}
          @click=${() => (this.editing = true)}
        >
          ${ICON_EDIT}
        </button>
      </div>
      ${
        this.editing
          ? html`<cvc-tag-edit-dialog
              .client=${this.client}
              ownerId=${this.ownerId}
              .resource=${resource}
              .suggestions=${this.suggestions}
              @cvc-tag-close=${(event: Event) => {
                event.stopPropagation();
                this.editing = false;
              }}
              @cvc-tags-applied=${this.onApplied}
            ></cvc-tag-edit-dialog>`
          : nothing
      }
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      .tags {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem;
      }
      .tag {
        padding: 0 0.5rem;
        font-size: 0.78rem;
        line-height: 1.5;
        border-radius: 999px;
        color: var(--cvc-info);
        background: color-mix(in srgb, var(--cvc-info) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--cvc-info) 30%, transparent);
      }
      .tag.inherited {
        color: var(--cvc-muted);
        background: transparent;
        border-style: dashed;
        border-color: var(--cvc-border);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-resource-tags': CvcResourceTags;
  }
}
