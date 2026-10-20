import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CONSOLE_URL } from '../../core/constants.js';
import { indexActivity, type AppActivity } from '../../core/home/activity.js';
import type { CostStore } from '../../core/home/cost-store.js';
import type { GroupNode } from '../../core/home/grouping.js';
import type { HomeStore } from '../../core/home/home-store.js';
import { buildHomeList, displayOrder } from '../../core/home/list.js';
import { DEFAULT_PREFS, readPrefs, toggleCollapsed, writePrefs, type HomePrefs } from '../../core/home/prefs.js';
import { t } from '../../core/i18n.js';
import { routeToHash, withListView, type AppTab, type ListView } from '../../core/router.js';
import type { Deployment, OrganisationSummary } from '../../data/api.js';
import { CvcElement } from '../shared/cvc-element.js';
import { APP_STATE_LABELS, stateLabel } from '../shared/format.js';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const FOLDED_KEY = 'cvc.appNav';

/**
 * The home list beside an application page, names only: the same filter,
 * grouping, order and collapsed groups as the home page, so the next
 * application of a project is one click (or Alt+↓) away, on the same tab.
 * Emits `cvc-list-view` when the filter or the grouping changes.
 */
@customElement('cvc-app-nav')
export class CvcAppNav extends CvcElement {
  @property({ attribute: false }) orga!: OrganisationSummary;
  @property({ attribute: false }) client!: CcApiClient;
  @property({ attribute: false }) store!: HomeStore;
  @property({ attribute: false }) costStore: CostStore | null = null;
  @property() appId = '';
  @property() tab: AppTab = 'overview';
  @property() filterText = '';
  @property() groupingText = '';
  /** Reduced to a thin strip; remembered in this browser. */
  @property({ type: Boolean, reflect: true }) folded = readFolded();

  @state() private prefs: HomePrefs = DEFAULT_PREFS;

  #activitySource: readonly Deployment[] | null = null;
  #activity: Map<string, AppActivity> = new Map();
  /** Applications in display order, for Alt+↑ and Alt+↓. */
  #appOrder: string[] = [];
  #reveal = true;

  private readonly onStoreChange = () => this.requestUpdate();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    const target = event.composedPath()[0];
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))
    ) {
      return;
    }
    const order = this.#appOrder;
    if (order.length === 0) {
      return;
    }
    event.preventDefault();
    const index = order.indexOf(this.appId);
    const next =
      event.key === 'ArrowDown'
        ? index === -1
          ? 0
          : Math.min(index + 1, order.length - 1)
        : index === -1
          ? order.length - 1
          : Math.max(index - 1, 0);
    if (order[next] !== this.appId) {
      window.location.hash = this.appHref(order[next]);
    }
  };

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.onKeyDown);
  }

  override disconnectedCallback(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.store?.removeEventListener('change', this.onStoreChange);
    this.costStore?.removeEventListener('change', this.onStoreChange);
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues): void {
    if (changed.has('store')) {
      (changed.get('store') as HomeStore | undefined)?.removeEventListener('change', this.onStoreChange);
      this.store?.addEventListener('change', this.onStoreChange);
    }
    if (changed.has('costStore')) {
      (changed.get('costStore') as CostStore | null | undefined)?.removeEventListener('change', this.onStoreChange);
      this.costStore?.addEventListener('change', this.onStoreChange);
    }
    if (changed.has('orga') && this.orga != null) {
      const previous = changed.get('orga') as OrganisationSummary | undefined;
      if (previous?.id !== this.orga.id) {
        this.prefs = readPrefs(this.orga.id);
        this.#reveal = true;
      }
      if (this.client != null && this.store != null) {
        const appIds = this.orga.applications.filter((app) => !app.isArchived).map((app) => app.id);
        void this.store.refresh(this.client, this.orga.id, appIds, {});
      }
    }
    if (changed.has('appId') || changed.has('folded')) {
      this.#reveal = true;
    }
  }

  override updated(): void {
    if (this.#reveal) {
      this.#reveal = false;
      this.revealCurrent();
    }
  }

  /** Scrolls the list so the current application shows, when it does not already. */
  private revealCurrent(): void {
    const tree = this.renderRoot.querySelector<HTMLElement>('.tree');
    const item = tree?.querySelector<HTMLElement>('a.current');
    if (tree == null || item == null) {
      return;
    }
    const top = item.offsetTop;
    if (top < tree.scrollTop || top + item.offsetHeight > tree.scrollTop + tree.clientHeight) {
      tree.scrollTop = Math.max(0, top - tree.clientHeight / 3);
    }
  }

  private activity(deployments: readonly Deployment[] | null): Map<string, AppActivity> {
    if (deployments !== this.#activitySource) {
      this.#activitySource = deployments;
      this.#activity = indexActivity(deployments ?? []);
    }
    return this.#activity;
  }

  private get view(): ListView {
    return { filter: this.filterText, grouping: this.groupingText };
  }

  private appHref(appId: string): string {
    return withListView(routeToHash({ kind: 'app', ownerId: this.orga.id, appId, tab: this.tab }), this.view);
  }

  private emitView(view: ListView): void {
    this.dispatchEvent(new CustomEvent<ListView>('cvc-list-view', { detail: view }));
  }

  private setGrouping(grouping: string): void {
    this.prefs = { ...this.prefs, grouping };
    writePrefs(this.orga.id, this.prefs);
    this.emitView({ filter: this.filterText, grouping });
  }

  private toggleGroup(path: string): void {
    this.prefs = toggleCollapsed(this.prefs, path);
    writePrefs(this.orga.id, this.prefs);
  }

  private setFolded(folded: boolean): void {
    this.folded = folded;
    try {
      localStorage.setItem(FOLDED_KEY, folded ? 'folded' : 'open');
    } catch {
      // Not essential.
    }
  }

  override render() {
    if (this.orga == null || this.store == null) {
      return nothing;
    }
    const data = this.store.get(this.orga.id);
    const apps = this.orga.applications.filter((app) => !app.isArchived);
    const list = buildHomeList({
      apps,
      addons: this.orga.addons,
      links: data.links,
      activity: this.activity(data.deployments),
      filterText: this.filterText,
      groupingText: this.groupingText,
      showAddons: this.prefs.showAddons,
      sort: this.prefs.sort,
      costs: this.prefs.costs ? (this.costStore?.table(this.orga.id, this.prefs.costSource) ?? null) : null,
      stateLabel: (appState) => stateLabel(APP_STATE_LABELS, appState).label,
    });
    const appIds = new Set(apps.map((app) => app.id));
    this.#appOrder = displayOrder(list.tree, this.prefs.collapsed).filter((id) => appIds.has(id));

    if (this.folded) {
      return html`<nav class="folded" aria-label=${t('nav.aria')}>
        <button
          type="button"
          class="fold"
          title=${t('nav.unfold')}
          aria-label=${t('nav.unfold')}
          aria-expanded="false"
          @click=${() => this.setFolded(false)}
        >
          »
        </button>
      </nav>`;
    }

    const count = list.visibleApps.length + list.visibleAddons.length;
    const listed = list.visibleApps.some((app) => app.id === this.appId);
    const error = list.filter.error ?? list.grouping.error;
    return html`<nav aria-label=${t('nav.aria')}>
      <div class="head">
        <a
          class="back"
          href=${withListView(routeToHash({ kind: 'orga', ownerId: this.orga.id }), this.view)}
          title=${t('nav.backTitle')}
          >← ${t('nav.back')}</a
        >
        <span class="count">${count}</span>
        <span class="grow"></span>
        <button
          type="button"
          class="fold"
          title=${t('nav.fold')}
          aria-label=${t('nav.fold')}
          aria-expanded="true"
          @click=${() => this.setFolded(true)}
        >
          «
        </button>
      </div>
      <div class="fields">
        <input
          name="nav-filter"
          aria-label=${t('home.filter')}
          placeholder=${t('nav.filter')}
          autocomplete="off"
          spellcheck="false"
          .value=${this.filterText}
          @input=${(event: Event) =>
            this.emitView({ filter: (event.currentTarget as HTMLInputElement).value, grouping: this.groupingText })}
        />
        <input
          name="nav-grouping"
          aria-label=${t('home.groupBy')}
          placeholder=${t('nav.grouping')}
          autocomplete="off"
          spellcheck="false"
          .value=${this.groupingText}
          @input=${(event: Event) => this.setGrouping((event.currentTarget as HTMLInputElement).value)}
        />
      </div>
      ${error != null ? html`<p class="error-text">${error}</p>` : nothing}
      ${
        listed
          ? nothing
          : html`<p class="outside">
              ${t('nav.outside')}
              ${
                this.filterText.trim() !== ''
                  ? html`<button
                      type="button"
                      class="link"
                      @click=${() => this.emitView({ filter: '', grouping: this.groupingText })}
                    >
                      ${t('nav.clearFilter')}
                    </button>`
                  : nothing
              }
            </p>`
      }
      <div class="tree">
        ${count === 0 ? html`<p class="empty">${t('home.nothing')}</p>` : this.renderNodes(list.tree)}
      </div>
      <p class="hint" title=${t('nav.shortcutTitle')}>
        <kbd>${IS_MAC ? '⌥↑' : 'Alt+↑'}</kbd> <kbd>${IS_MAC ? '⌥↓' : 'Alt+↓'}</kbd> ${t('nav.shortcut')}
      </p>
    </nav>`;
  }

  private renderNodes(nodes: readonly GroupNode[]): unknown {
    return nodes.map((node) => (node.level === 0 ? this.renderItems(node) : this.renderGroup(node)));
  }

  private renderGroup(node: GroupNode) {
    const collapsed = this.prefs.collapsed.includes(node.path);
    const holdsCurrent = collapsed && holds(node, this.appId);
    return html`<div class="group">
      <button
        type="button"
        class="group-toggle ${node.missing ? 'missing' : ''} ${holdsCurrent ? 'holds-current' : ''}"
        aria-expanded=${!collapsed}
        title=${node.label}
        @click=${() => this.toggleGroup(node.path)}
      >
        <span class="chevron" aria-hidden="true">${collapsed ? '▸' : '▾'}</span>
        <span class="label">${node.label}</span>
        <span class="count">${node.appCount + node.addonCount}</span>
      </button>
      ${collapsed ? nothing : node.children.length > 0 ? this.renderNodes(node.children) : this.renderItems(node)}
    </div>`;
  }

  private renderItems(node: GroupNode) {
    return html`<ul class="items">
      ${node.apps.map((app) => {
        const current = app.id === this.appId;
        return html`<li>
          <a
            class="item ${current ? 'current' : ''}"
            href=${this.appHref(app.id)}
            aria-current=${current ? 'page' : nothing}
            title="${app.name} · ${app.variantName}"
          >
            <img src=${app.variantLogoUrl} alt="" width="16" height="16" loading="lazy" />
            <span class="name">${app.name}</span>
          </a>
        </li>`;
      })}
      ${node.addons.map(
        (addon) =>
          html`<li>
            <a
              class="item addon"
              href="${CONSOLE_URL}/goto/${addon.id}"
              target="_blank"
              rel="noopener"
              title=${t('nav.addonTitle', { name: addon.name, provider: addon.providerId })}
            >
              <img src=${addon.logoUrl} alt="" width="16" height="16" loading="lazy" />
              <span class="name">${addon.name}</span>
              <span class="external" aria-hidden="true">↗</span>
            </a>
          </li>`,
      )}
    </ul>`;
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: none;
      width: 260px;
      min-height: 0;
    }
    :host([folded]) {
      width: auto;
    }
    nav {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex: 1;
      min-height: 0;
      padding: 0 0.9rem 1.25rem 0;
      border-right: 1px solid var(--cvc-border);
    }
    nav.folded {
      padding-right: 0.5rem;
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      background: none;
      border: none;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .back {
      font-weight: 600;
      color: var(--cvc-text);
      text-decoration: none;
    }
    .back:hover {
      color: var(--cvc-accent);
    }
    .count {
      color: var(--cvc-muted);
      font-size: 0.75rem;
      font-weight: 400;
    }
    .grow {
      flex: 1;
    }
    .fold {
      padding: 0.1rem 0.45rem;
      border-radius: 4px;
      color: var(--cvc-muted);
    }
    .fold:hover {
      color: var(--cvc-accent);
      background: color-mix(in srgb, var(--cvc-accent) 10%, transparent);
    }
    .fold:focus-visible,
    .group-toggle:focus-visible,
    .item:focus-visible,
    .back:focus-visible {
      outline: 2px solid var(--cvc-accent);
      outline-offset: 1px;
    }
    .fields {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.3rem 0.5rem;
      font-family: var(--cvc-mono);
      font-size: 0.8rem;
      color: var(--cvc-text);
      background: var(--cvc-surface);
      border: 1px solid var(--cvc-border);
      border-radius: 6px;
    }
    input:focus {
      outline: 2px solid color-mix(in srgb, var(--cvc-accent) 40%, transparent);
      border-color: var(--cvc-accent);
    }
    p {
      margin: 0;
    }
    .error-text {
      color: var(--cvc-danger);
      font-size: 0.75rem;
    }
    .outside {
      color: var(--cvc-muted);
      font-size: 0.75rem;
    }
    .outside button.link {
      padding: 0;
      color: var(--cvc-accent);
      text-decoration: underline;
    }
    .tree {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: auto;
      margin: 0 -0.3rem;
      padding: 0 0.3rem;
    }
    .empty {
      color: var(--cvc-muted);
      font-size: 0.85rem;
    }
    .group .group {
      margin-left: 0.8rem;
    }
    .group-toggle {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      width: 100%;
      padding: 0.25rem 0.3rem;
      font-size: 0.8rem;
      font-weight: 600;
      text-align: left;
      color: var(--cvc-text);
      border-radius: 4px;
    }
    .group-toggle:hover {
      background: color-mix(in srgb, var(--cvc-muted) 10%, transparent);
    }
    .group-toggle .chevron {
      width: 0.7rem;
      color: var(--cvc-muted);
    }
    .group-toggle .label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .group-toggle.missing .label {
      color: var(--cvc-muted);
      font-style: italic;
    }
    .group-toggle.holds-current .label {
      color: var(--cvc-accent);
    }
    ul.items {
      list-style: none;
      margin: 0 0 0.25rem;
      padding: 0;
    }
    .group > ul.items {
      padding-left: 1rem;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.2rem 0.4rem;
      font-size: 0.85rem;
      color: var(--cvc-text);
      text-decoration: none;
      border-radius: 4px;
    }
    .item img {
      flex: none;
      border-radius: 3px;
    }
    .item .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .external {
      flex: none;
      font-size: 0.75em;
    }
    .item:hover {
      background: color-mix(in srgb, var(--cvc-muted) 10%, transparent);
    }
    .item.current {
      font-weight: 600;
      color: var(--cvc-accent);
      background: color-mix(in srgb, var(--cvc-accent) 12%, transparent);
    }
    .item.addon {
      color: var(--cvc-muted);
    }
    .hint {
      padding-top: 0.4rem;
      font-size: 0.75rem;
      color: var(--cvc-muted);
      border-top: 1px solid var(--cvc-border);
    }
    kbd {
      font-family: inherit;
      font-size: 0.7rem;
      padding: 0 0.25rem;
      border: 1px solid var(--cvc-border);
      border-radius: 4px;
    }
  `;
}

/** True when the application sits somewhere under the node. */
function holds(node: GroupNode, appId: string): boolean {
  return node.apps.some((app) => app.id === appId) || node.children.some((child) => holds(child, appId));
}

/** Folded when the reader said so, or by default on a narrow window. */
function readFolded(): boolean {
  try {
    const stored = localStorage.getItem(FOLDED_KEY);
    if (stored === 'folded' || stored === 'open') {
      return stored === 'folded';
    }
  } catch {
    // Falls back to the width.
  }
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1000px)').matches;
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-nav': CvcAppNav;
  }
}
