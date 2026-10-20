import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import {
  findFavorite,
  NO_FAVORITES,
  viewParams,
  type FavoriteView,
  type Favorites,
  type ViewSpec,
} from '../core/home/favorites.js';
import { DEFAULT_PREFS } from '../core/home/prefs.js';
import { t } from '../core/i18n.js';
import { routeToHash, withHashParams } from '../core/router.js';
import { SYNC_CREATE_COMMAND, type SyncStore } from '../core/sync/sync-store.js';
import { copyToClipboard } from './shared/clipboard.js';
import './shared/cvc-cli.js';
import { formatRelative } from './shared/format.js';
import { CvcElement } from './shared/cvc-element.js';
import { ICON_EDIT, ICON_LINK } from './shared/icons.js';
import { sharedStyles } from './shared/styles.js';

/** Room kept between the panel and the edge of the window. */
const EDGE = 8;

export interface FavoriteNameDetail {
  name: string;
}

export interface FavoriteRenameDetail {
  id: string;
  name: string;
}

export interface FavoriteViewDetail {
  view: FavoriteView;
}

/**
 * The favourite views of an organisation, as a menu beside "Refresh": the
 * button names the current view when it is one; the panel saves the current
 * view under a name and lists the others, each applied in a click, its link
 * copied, renamed in place or removed. The page keeps the favourites and
 * hears `cvc-favorite-save`, `-apply`, `-leave`, `-rename` and `-remove`.
 */
@customElement('cvc-favorites-menu')
export class CvcFavoritesMenu extends CvcElement {
  @property() ownerId = '';
  @property({ attribute: false }) favorites: Favorites = NO_FAVORITES;
  @property({ attribute: false }) current: ViewSpec = { filter: '', grouping: '', sort: DEFAULT_PREFS.sort };
  /** The sync: offered once there is a favourite, its state shown once on. */
  @property({ attribute: false }) sync: SyncStore | null = null;

  @state() private open = false;
  /** The name typed for the current view. */
  @state() private name = '';
  @state() private renaming: FavoriteRenameDetail | null = null;
  @state() private copied: string | null = null;

  @query('.trigger') private trigger?: HTMLButtonElement;
  @query('[popover]') private panel?: HTMLElement;

  private readonly onSyncChange = () => this.requestUpdate();

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('sync')) {
      (changed.get('sync') as SyncStore | null | undefined)?.removeEventListener('change', this.onSyncChange);
      this.sync?.addEventListener('change', this.onSyncChange);
    }
  }

  override disconnectedCallback(): void {
    this.sync?.removeEventListener('change', this.onSyncChange);
    super.disconnectedCallback();
  }

  /** Placed under the button, its right edge on the button's, before it shows. */
  private onBeforeToggle(event: Event): void {
    if ((event as Event & { newState?: string }).newState !== 'open' || this.trigger == null || this.panel == null) {
      return;
    }
    const rect = this.trigger.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(EDGE, rect.right - 360)}px`;
    const { filter, grouping } = this.current;
    this.name = (filter.trim() || grouping.trim()).slice(0, 60);
    this.renaming = null;
  }

  private async onToggle(event: Event): Promise<void> {
    this.open = (event as Event & { newState?: string }).newState === 'open';
    if (!this.open) {
      return;
    }
    await this.updateComplete;
    const input = this.renderRoot.querySelector<HTMLInputElement>('#view-name');
    if (input != null) {
      input.focus();
      input.select();
    } else {
      this.renderRoot.querySelector<HTMLButtonElement>('.apply')?.focus();
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    // Closed here rather than by the browser, so the page does not also clear its selection.
    event.preventDefault();
    event.stopPropagation();
    if (this.renaming != null) {
      this.renaming = null;
      return;
    }
    this.close();
  }

  private close(refocus = true): void {
    if (this.panel?.matches(':popover-open')) {
      this.panel.hidePopover();
    }
    if (refocus) {
      this.trigger?.focus();
    }
  }

  private emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, { detail }));
  }

  private save(event: Event): void {
    event.preventDefault();
    if (this.name.trim() === '') {
      return;
    }
    this.emit<FavoriteNameDetail>('cvc-favorite-save', { name: this.name });
    // Kept open while the sync is still to offer: the moment a view is worth keeping elsewhere.
    if (this.sync?.state !== 'off' || this.sync.declined) {
      this.close();
    }
  }

  private apply(view: FavoriteView): void {
    this.emit<FavoriteViewDetail>('cvc-favorite-apply', { view });
    this.close();
  }

  /** Back to the whole list, the favourite untouched. */
  private leave(): void {
    this.emit<undefined>('cvc-favorite-leave', undefined);
    this.close();
  }

  private commitRename(event: Event): void {
    event.preventDefault();
    const renaming = this.renaming;
    if (renaming != null && renaming.name.trim() !== '') {
      this.emit<FavoriteRenameDetail>('cvc-favorite-rename', renaming);
    }
    this.renaming = null;
  }

  /** The link of a view: the home page of this organisation with `?q=&g=&s=`. */
  private async copyLink(view: FavoriteView): Promise<void> {
    const hash = withHashParams(routeToHash({ kind: 'orga', ownerId: this.ownerId }), viewParams(view));
    if (await copyToClipboard(`${window.location.origin}${window.location.pathname}${hash}`)) {
      this.copied = view.id;
      setTimeout(() => {
        if (this.copied === view.id) {
          this.copied = null;
        }
      }, 1500);
    }
  }

  override render() {
    const views = this.favorites.views;
    const active = findFavorite(this.favorites, this.current);
    return html`<button
        type="button"
        class="trigger ${this.open ? 'open' : ''} ${active != null ? 'active' : ''}"
        popovertarget="panel"
        aria-haspopup="dialog"
        aria-controls="panel"
        aria-expanded=${this.open}
        title=${active != null ? t('fav.currentTitle') : t('fav.menuTitle')}
      >
        <span class="label"
          >${active != null ? `★ ${active.name}` : `☆ ${t('fav.menu')}`}${
            active == null && views.length > 0 ? html` <span class="muted">${views.length}</span>` : nothing
          }</span
        >
        <svg class="caret" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div
        id="panel"
        popover
        role="dialog"
        aria-label=${t('fav.title')}
        @beforetoggle=${this.onBeforeToggle}
        @toggle=${this.onToggle}
        @keydown=${this.onKeyDown}
      >
        ${
          active != null
            ? html`<div class="menu-head">
                <p class="muted small">${t('fav.current', { name: active.name })}</p>
                <button type="button" class="link" title=${t('fav.leaveTitle')} @click=${this.leave}>
                  ${t('fav.leave')}
                </button>
              </div>`
            : html`<form class="save" @submit=${this.save}>
                <label class="small" for="view-name">${t('fav.saveCurrent')}</label>
                <div class="row">
                  <input
                    id="view-name"
                    type="text"
                    maxlength="80"
                    placeholder=${t('fav.namePlaceholder')}
                    .value=${this.name}
                    @input=${(event: Event) => (this.name = (event.currentTarget as HTMLInputElement).value)}
                  />
                  <button type="submit" class="primary small" ?disabled=${this.name.trim() === ''}>
                    ${t('common.save')}
                  </button>
                </div>
              </form>`
        }
        <hr />
        ${
          views.length === 0
            ? html`<p class="muted small">${t('fav.none')}</p>`
            : html`<ul>
                ${views.map((view) => this.renderView(view, view.id === active?.id))}
              </ul>`
        }
        ${this.renderSync(views.length)}
      </div>`;
  }

  /**
   * Off: the offer to sync, once there is a view worth keeping and unless it
   * was declined; it creates an add-on, so it waits for a click. On: when the
   * views were last synced, or why they could not be.
   */
  private renderSync(count: number) {
    const sync = this.sync;
    if (sync == null || sync.state === 'idle') {
      return nothing;
    }
    if (sync.state === 'enabling') {
      return html`<hr />
        <p class="muted small">${t('sync.enabling')}</p>`;
    }
    if (sync.state === 'on') {
      return html`<hr />
        <p class="small sync-state">
          ${
            sync.error != null
              ? html`<span class="danger">${t('sync.failed', { error: sync.error })}</span>
                  <button type="button" class="link" @click=${() => sync.syncNow()}>${t('common.retry')}</button>`
              : html`<span class="muted"
                  >${sync.busy ? t('sync.syncing') : t('sync.on')}${
                    sync.lastSyncAt != null && !sync.busy
                      ? ` · ${t('sync.lastSync', { when: formatRelative(sync.lastSyncAt) })}`
                      : ''
                  }</span
                >`
          }
        </p>`;
    }
    if (count === 0 || sync.declined) {
      return nothing;
    }
    return html`<hr />
      <div class="offer">
        <p class="small">${t('sync.offer')}</p>
        <cvc-cli block command=${SYNC_CREATE_COMMAND}></cvc-cli>
        ${sync.error != null ? html`<p class="small danger">${t('sync.createFailed', { error: sync.error })}</p>` : nothing}
        <div class="row">
          <button type="button" class="primary small" @click=${() => sync.enable()}>${t('sync.enable')}</button>
          <button type="button" class="ghost small" @click=${() => sync.decline()}>${t('sync.notNow')}</button>
        </div>
      </div>`;
  }

  private renderView(view: FavoriteView, active: boolean) {
    const renaming = this.renaming?.id === view.id ? this.renaming : null;
    const summary = [view.filter, view.grouping].filter((part) => part !== '').join(' · ') || t('fav.everything');
    return html`<li class=${active ? 'active' : ''}>
      ${
        renaming != null
          ? html`<form class="rename" @submit=${this.commitRename}>
              <input
                type="text"
                maxlength="80"
                aria-label=${t('fav.name')}
                .value=${renaming.name}
                @input=${(event: Event) =>
                  (this.renaming = { id: view.id, name: (event.currentTarget as HTMLInputElement).value })}
              />
              <button type="submit" class="primary small">${t('common.save')}</button>
            </form>`
          : html`<button
              type="button"
              class="apply"
              aria-current=${active ? 'true' : 'false'}
              title=${t('fav.apply')}
              @click=${() => this.apply(view)}
            >
              <span class="name">${view.name}</span>
              <span class="muted small mono summary">${summary}</span>
            </button>`
      }
      <span class="actions">
        <button
          type="button"
          class="icon-button"
          title=${this.copied === view.id ? t('fav.linkCopied') : t('fav.copyLink')}
          aria-label=${t('fav.copyLink')}
          @click=${() => this.copyLink(view)}
        >
          ${this.copied === view.id ? '✓' : ICON_LINK}
        </button>
        <button
          type="button"
          class="icon-button"
          title=${t('fav.rename')}
          aria-label=${t('fav.rename')}
          @click=${async () => {
            this.renaming = { id: view.id, name: view.name };
            await this.updateComplete;
            this.renderRoot.querySelector<HTMLInputElement>('.rename input')?.select();
          }}
        >
          ${ICON_EDIT}
        </button>
        <button
          type="button"
          class="icon-button"
          title=${t('fav.remove')}
          aria-label=${t('fav.remove')}
          @click=${() => this.emit<FavoriteViewDetail>('cvc-favorite-remove', { view })}
        >
          ×
        </button>
      </span>
    </li>`;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: inline-flex;
      }
      .trigger {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        max-width: 16rem;
        padding: 0.3rem 0.6rem 0.3rem 0.65rem;
        font-size: 0.85rem;
        background: transparent;
      }
      .trigger .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .trigger.active {
        color: var(--cvc-accent);
      }
      .trigger.open,
      .trigger:hover {
        border-color: var(--cvc-accent);
      }
      .caret {
        flex: none;
        opacity: 0.7;
        transition: transform 0.15s;
      }
      .trigger.open .caret {
        transform: rotate(180deg);
      }
      [popover] {
        position: fixed;
        inset: auto;
        margin: 0;
        width: min(360px, calc(100vw - 16px));
        box-sizing: border-box;
        padding: 0.6rem 0.7rem;
        color: var(--cvc-text);
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
        box-shadow: var(--cvc-shadow-pop);
      }
      [popover]:popover-open {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      hr {
        width: 100%;
        margin: 0.1rem 0;
        border: none;
        border-top: 1px solid var(--cvc-border);
      }
      .save {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .save .row,
      .rename {
        display: flex;
        gap: 0.4rem;
      }
      .save input,
      .rename input {
        flex: 1;
        min-width: 0;
        padding: 0.3rem 0.5rem;
        font-size: 0.88rem;
      }
      button.small {
        padding: 0.25rem 0.6rem;
        font-size: 0.82rem;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        max-height: 50vh;
        overflow: auto;
      }
      li {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.15rem 0.3rem;
        border-radius: 6px;
      }
      li.active {
        background: color-mix(in srgb, var(--cvc-accent) 10%, transparent);
      }
      .apply {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 0.2rem 0.1rem;
        border: none;
        background: none;
        text-align: left;
      }
      .apply .name {
        font-weight: 500;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .apply:hover .name,
      li.active .name {
        color: var(--cvc-accent);
      }
      .apply .summary {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.75rem;
      }
      .rename {
        flex: 1;
        min-width: 0;
      }
      .actions {
        display: inline-flex;
        flex: none;
        opacity: 0.55;
      }
      li:hover .actions,
      li:focus-within .actions {
        opacity: 1;
      }
      .icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.6rem;
        height: 1.6rem;
        padding: 0;
        border: none;
        background: none;
        color: var(--cvc-muted);
        border-radius: 6px;
      }
      .offer {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .offer .row {
        display: flex;
        gap: 0.4rem;
      }
      .sync-state {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
      }
      .danger {
        color: var(--cvc-danger);
      }
      .icon-button:hover {
        color: var(--cvc-text);
        background: color-mix(in srgb, var(--cvc-accent) 10%, transparent);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-favorites-menu': CvcFavoritesMenu;
  }
}
