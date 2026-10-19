import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { t, type MessageKey } from '../core/i18n.js';
import { CvcElement } from './shared/cvc-element.js';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../core/clever-client.js';
import { CONSOLE_URL } from '../core/constants.js';
import {
  describeOrigin,
  indexActivity,
  isHumanDeployment,
  isInProgress,
  watchList,
  type AppActivity,
  type WatchItem,
} from '../core/home/activity.js';
import { matchesFilter, parseFilter, toggleToken } from '../core/home/filter.js';
import {
  buildTree,
  groupingSuggestions,
  isWeak,
  linkedAddons,
  linkedApps,
  parseGrouping,
  type GroupNode,
  type GroupingContext,
} from '../core/home/grouping.js';
import { COST_DAYS, type CostStore, type OwnerCosts } from '../core/home/cost-store.js';
import {
  COST_SOURCES,
  dayTotal,
  lastDays,
  nodeCost,
  shownCost,
  totalCost,
  unlistedCost,
  type CostSource,
  type CostTable,
} from '../core/home/costs.js';
import type { HomeStore } from '../core/home/home-store.js';
import { loadPlatformStatus } from '../core/home/platform-status.js';
import { listRecents } from '../core/home/recents.js';
import { SORT_COLUMNS, sortNodes, toggleSort, type SortColumn, type SortSpec } from '../core/home/sorting.js';
import type { BulkApp, BulkKind } from '../core/home/bulk.js';
import { apiExecutor, invertSteps, runSteps, type TagResource, type TagStep } from '../core/home/tagging.js';
import { readHashParams, routeToHash, writeHashParams } from '../core/router.js';
import type { AddonSummary, ApplicationSummary, Deployment, OrganisationSummary } from '../data/api.js';
import './cvc-platform-status.js';
import './cvc-tag-dialog.js';
import type { TagOperationKind, TagsAppliedDetail } from './cvc-tag-dialog.js';
import './cvc-bulk-dialog.js';
import type { BulkDoneDetail } from './cvc-bulk-dialog.js';
import { pushToast, requestSummaryRefresh } from './shared/events.js';
import {
  APP_STATE_LABELS,
  deploymentActionLabel,
  DEPLOYMENT_STATE_LABELS,
  formatDateTime,
  formatDay,
  formatMoney,
  formatMonth,
  formatRelative,
  stateLabel,
} from './shared/format.js';
import { sharedStyles } from './shared/styles.js';

interface HomePrefs {
  grouping: string | null;
  sort: SortSpec;
  showAddons: boolean;
  collapsed: string[];
  costs: boolean;
  costSource: CostSource;
}

/** An application opened in this browser, with the time of the last visit. */
interface RecentApp {
  app: ApplicationSummary;
  at: number;
}

const DEFAULT_PREFS: HomePrefs = {
  grouping: null,
  sort: { column: 'name', direction: 'asc' },
  showAddons: true,
  collapsed: [],
  costs: false,
  costSource: 'days30',
};

/** Per source: its line in the costs card and the title of the column cells. */
const COST_SOURCE_SPECS: Record<CostSource, { label: MessageKey; hint: MessageKey; title: MessageKey }> = {
  yesterday: { label: 'costs.yesterday', hint: 'costs.hint.yesterday', title: 'costs.columnTitle.yesterday' },
  days30: { label: 'costs.days30', hint: 'costs.hint.days30', title: 'costs.columnTitle.days30' },
  invoice: { label: 'costs.invoice', hint: 'costs.hint.invoice', title: 'costs.columnTitle.invoice' },
  estimate: { label: 'costs.estimate', hint: 'costs.hint.estimate', title: 'costs.columnTitle.estimate' },
};
const COLUMN_LABELS: Record<SortColumn, MessageKey> = {
  name: 'home.col.name',
  type: 'home.col.type',
  state: 'home.col.state',
  activity: 'home.col.activity',
  links: 'home.col.links',
  cost: 'home.col.cost',
};
const MAX_RECENTS = 8;
const MAX_LINK_ICONS = 6;
const COLUMNS = 7;

const WATCH_LABELS: Record<WatchItem['kind'], { label: MessageKey; tone: string }> = {
  failed: { label: 'watch.failed', tone: 'danger' },
  deploying: { label: 'watch.deploying', tone: 'warn' },
  moderated: { label: 'watch.moderated', tone: 'danger' },
  payment: { label: 'watch.payment', tone: 'danger' },
};

/**
 * Home of one organisation: a dense, searchable list of applications and
 * add-ons, filtered and grouped by expressions, with what deserves
 * attention on top, the applications opened recently, and a selection
 * for bulk tag operations.
 */
@customElement('cvc-orga-page')
export class CvcOrgaPage extends CvcElement {
  @property({ attribute: false }) orga!: OrganisationSummary;
  @property({ attribute: false }) client!: CcApiClient;
  @property({ attribute: false }) store!: HomeStore;
  @property({ attribute: false }) costStore!: CostStore;
  /** Id of the signed-in user, to say "toi" in the activity column. */
  @property() userId = '';
  /** Bumped by the shell after an action so the activity reloads. */
  @property({ type: Number }) revision = 0;

  @state() private filterText = '';
  @state() private groupingText = '';
  @state() private prefs: HomePrefs = DEFAULT_PREFS;
  @state() private selected: ReadonlySet<string> = new Set();
  @state() private tagDialog: TagOperationKind | null = null;
  @state() private bulkDialog: BulkKind | null = null;
  /** True when the side column is taller than the viewport: it then scrolls with the list instead of sticking. */
  @state() private sideTall = false;

  @query('input[name="filter"]') private filterInput?: HTMLInputElement;
  @query('aside.side') private sideElement?: HTMLElement;

  #sideObserver: ResizeObserver | null = null;

  #activitySource: readonly Deployment[] | null = null;
  #activity: Map<string, AppActivity> = new Map();
  /** Ids of the visible rows in display order, for shift-click ranges and "select all". */
  #order: string[] = [];
  /** Columns of the list tables, one more when the costs show. */
  #columns = COLUMNS;
  /** True while the selected cost source is still loading, for the placeholders of the list. */
  #costsPending = false;
  #lastClicked: string | null = null;

  private readonly onStoreChange = () => this.requestUpdate();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.composedPath()[0];
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))
    ) {
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      this.filterInput?.focus();
      this.filterInput?.select();
    } else if (
      event.key === 'Escape' &&
      !event.defaultPrevented &&
      this.tagDialog == null &&
      this.bulkDialog == null &&
      this.selected.size > 0
    ) {
      // A dialog closing on Escape prevents the default, so the selection survives it.
      this.clearSelection();
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
    this.#sideObserver?.disconnect();
    this.#sideObserver = null;
    super.disconnectedCallback();
  }

  override firstUpdated(): void {
    // A sticky column taller than the scroll area would hide its bottom until the list
    // is scrolled to its end; watch both heights and let it scroll with the list instead.
    const scroller = this.parentElement;
    if (this.sideElement == null || scroller == null || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.#sideObserver = new ResizeObserver(() => {
      this.sideTall = (this.sideElement?.offsetHeight ?? 0) > scroller.clientHeight;
    });
    this.#sideObserver.observe(this.sideElement);
    this.#sideObserver.observe(scroller);
  }

  override willUpdate(changed: PropertyValues): void {
    if (changed.has('store')) {
      (changed.get('store') as HomeStore | undefined)?.removeEventListener('change', this.onStoreChange);
      this.store?.addEventListener('change', this.onStoreChange);
    }
    if (changed.has('costStore')) {
      (changed.get('costStore') as CostStore | undefined)?.removeEventListener('change', this.onStoreChange);
      this.costStore?.addEventListener('change', this.onStoreChange);
    }
    if (changed.has('orga')) {
      const previous = changed.get('orga') as OrganisationSummary | undefined;
      if (previous?.id !== this.orga.id) {
        this.prefs = readPrefs(this.orga.id);
        const params = readHashParams();
        this.filterText = params.get('q') ?? '';
        this.groupingText = params.get('g') ?? this.prefs.grouping ?? '';
        this.selected = new Set();
      }
      this.refresh({});
    } else if (changed.has('revision')) {
      this.refresh({ force: true });
    }
    if (changed.has('filterText') || changed.has('groupingText')) {
      writeHashParams({ q: this.filterText.trim(), g: this.groupingText.trim() });
      if (this.selected.size > 0) {
        this.selected = new Set();
      }
    }
  }

  private refresh(options: { force?: boolean; forceLinks?: boolean }): void {
    if (this.client == null || this.store == null || this.orga == null) {
      return;
    }
    const appIds = this.orga.applications.filter((app) => !app.isArchived).map((app) => app.id);
    void this.store.refresh(this.client, this.orga.id, appIds, options);
    if (this.prefs.costs) {
      void this.costStore?.refresh(this.client, this.orga.id, { force: options.force });
    }
  }

  private toggleCosts(on: boolean): void {
    this.setPrefs({ costs: on });
    if (on && this.client != null && this.costStore != null) {
      void this.costStore.refresh(this.client, this.orga.id);
    }
  }

  private setPrefs(patch: Partial<HomePrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    writePrefs(this.orga.id, this.prefs);
  }

  private setGrouping(text: string): void {
    this.groupingText = text;
    this.setPrefs({ grouping: text });
  }

  private toggleGroup(path: string): void {
    const collapsed = this.prefs.collapsed.includes(path)
      ? this.prefs.collapsed.filter((candidate) => candidate !== path)
      : [...this.prefs.collapsed, path];
    this.setPrefs({ collapsed });
  }

  private toggleTag(tag: string): void {
    // A `key:value` tag is a filter term on its own; a bare tag goes through `tag:`.
    this.filterText = toggleToken(this.filterText, /^[^:\s]+:[^\s]+$/.test(tag) ? tag : `tag:${tag}`);
  }

  private activity(deployments: readonly Deployment[] | null): Map<string, AppActivity> {
    if (deployments !== this.#activitySource) {
      this.#activitySource = deployments;
      this.#activity = indexActivity(deployments ?? []);
    }
    return this.#activity;
  }

  // --- selection and tags ------------------------------------------------

  private toggleSelect(id: string, range: boolean): void {
    const next = new Set(this.selected);
    const last = this.#lastClicked;
    if (range && last != null && last !== id && this.#order.includes(last) && this.#order.includes(id)) {
      const from = this.#order.indexOf(last);
      const to = this.#order.indexOf(id);
      const select = !this.selected.has(id);
      for (const other of this.#order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
        if (select) {
          next.add(other);
        } else {
          next.delete(other);
        }
      }
    } else if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.#lastClicked = id;
    this.selected = next;
  }

  /** Every application and add-on under a node, collapsed sub-groups included. */
  private groupIds(node: GroupNode): string[] {
    return [
      ...node.apps.map((app) => app.id),
      ...node.addons.map((addon) => addon.id),
      ...node.children.flatMap((child) => this.groupIds(child)),
    ];
  }

  private toggleGroupSelection(ids: string[], select: boolean): void {
    const next = new Set(this.selected);
    for (const id of ids) {
      if (select) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    this.selected = next;
  }

  private selectAll(): void {
    this.selected = new Set(this.#order);
  }

  private clearSelection(): void {
    this.selected = new Set();
    this.#lastClicked = null;
  }

  /** The applications of the selection, for a restart or a stop; add-ons are only counted. */
  private get selectedApps(): BulkApp[] {
    return this.orga.applications
      .filter((app) => this.selected.has(app.id))
      .map((app): BulkApp => ({ id: app.id, name: app.name, state: app.state }));
  }

  private get selectedAddonCount(): number {
    return this.orga.addons.filter((addon) => this.selected.has(addon.id)).length;
  }

  private get selectedResources(): TagResource[] {
    const apps = this.orga.applications
      .filter((app) => this.selected.has(app.id))
      .map((app): TagResource => ({ id: app.id, kind: 'app', name: app.name, tags: app.customerTags }));
    const addons = this.orga.addons
      .filter((addon) => this.selected.has(addon.id))
      .map((addon): TagResource => ({ id: addon.id, kind: 'addon', name: addon.name, tags: addon.customerTags }));
    return [...apps, ...addons];
  }

  private onTagsApplied(event: CustomEvent<TagsAppliedDetail>): void {
    const { result } = event.detail;
    this.tagDialog = null;
    const done = result.done.length;
    const failed = result.failed.length;
    const message =
      failed === 0
        ? t('tags.applied', { count: done })
        : t('tags.partial', { done, failed, error: result.failed[0].error });
    pushToast(this, {
      kind: failed === 0 ? 'success' : 'error',
      message,
      action: done > 0 ? { label: t('tags.undo'), run: () => void this.undo(result.done) } : undefined,
    });
    requestSummaryRefresh(this);
  }

  private onBulkDone(event: CustomEvent<BulkDoneDetail>): void {
    const { kind, result } = event.detail;
    this.bulkDialog = null;
    const done = result.done.length;
    const failed = result.failed.length;
    pushToast(this, {
      kind: failed === 0 ? 'success' : 'error',
      message:
        failed === 0
          ? t(kind === 'restart' ? 'bulk.restart.done' : 'bulk.stop.done', { count: done })
          : t('bulk.partial', { done, failed, error: result.failed[0].error }),
    });
    this.selected = new Set();
    requestSummaryRefresh(this);
    this.refresh({ force: true });
  }

  private async undo(steps: TagStep[]): Promise<void> {
    const result = await runSteps(invertSteps(steps), apiExecutor(this.client, this.orga.id), {
      describe: describeError,
    });
    pushToast(
      this,
      result.failed.length === 0
        ? {
            kind: 'info',
            message: t('tags.undone', { count: result.done.length }),
          }
        : { kind: 'error', message: t('tags.undoFailed', { error: result.failed[0].error }) },
    );
    requestSummaryRefresh(this);
  }

  // --- rendering ---------------------------------------------------------

  override render() {
    const data = this.store.get(this.orga.id);
    const apps = this.orga.applications.filter((app) => !app.isArchived);
    const addons = this.orga.addons;
    const activity = this.activity(data.deployments);
    const context: GroupingContext = {
      apps,
      addons,
      links: data.links,
      stateLabel: (appState) => stateLabel(APP_STATE_LABELS, appState).label,
    };
    const filter = parseFilter(this.filterText);
    const watch = watchList(apps, activity);
    const watchIds = new Set(watch.map((item) => item.app.id));
    const matchApp = (app: ApplicationSummary) =>
      matchesFilter(filter, {
        kind: 'app',
        name: app.name,
        slugs: [app.variantSlug, app.instanceType],
        runtime: app.variantName,
        state: stateLabel(APP_STATE_LABELS, app.state).label,
        tags: app.customerTags,
        extra: [app.id, ...linkedAddons(app.id, context).map((addon) => addon.name)],
        flags: watchIds.has(app.id) ? ['watch'] : [],
      });
    const matchAddon = (addon: AddonSummary) =>
      matchesFilter(filter, {
        kind: 'addon',
        name: addon.name,
        slugs: [addon.providerId, addon.providerId.replace(/-addon$/, '')],
        runtime: addon.providerId,
        tags: addon.customerTags,
        extra: [addon.id, addon.realId],
      });
    const grouping = parseGrouping(this.groupingText);
    const visibleApps = apps.filter(matchApp);
    const visibleAddons = this.prefs.showAddons ? addons.filter(matchAddon) : [];
    const costs =
      this.prefs.costs && this.costStore != null ? this.costStore.table(this.orga.id, this.prefs.costSource) : null;
    this.#costsPending =
      costs == null && this.prefs.costs && this.costStore != null && this.isSourcePending(this.prefs.costSource);
    this.#columns = this.prefs.costs ? COLUMNS + 1 : COLUMNS;
    const tree = sortNodes(buildTree(grouping, visibleApps, visibleAddons, context), this.prefs.sort, {
      activity,
      grouping: context,
      costs,
    });
    this.#order = this.displayOrder(tree);
    const appById = new Map(apps.map((app) => [app.id, app]));
    const recents = listRecents(this.orga.id)
      .map((visit) => ({ app: appById.get(visit.appId), at: visit.at }))
      .filter((visit): visit is RecentApp => visit.app != null)
      .slice(0, MAX_RECENTS);
    const linksDone = apps.filter((app) => data.links[app.id] != null).length;
    const suggestions = groupingSuggestions([...apps, ...addons]);
    const allTags = [...new Set([...apps, ...addons].flatMap((item) => item.customerTags))].sort((a, b) =>
      a.localeCompare(b, 'fr'),
    );

    return html`
      <div class="layout">
        <div class="main">
          <header class="head">
            <div class="row">
              <h1>${this.orga.name}</h1>
              <span class="muted small">${t('home.counts', { apps: apps.length, addons: addons.length })}</span>
              <span class="cli">clever applications list</span>
              <span class="grow"></span>
              ${
                data.linksPending > 0
                  ? html`<span class="muted small" title=${t('home.linksTitle')}
                      >${t('home.linksProgress', { done: linksDone, total: apps.length })}</span
                    >`
                  : data.deploymentsLoading
                    ? html`<span class="muted small">${t('home.activityLoading')}</span>`
                    : nothing
              }
              <button
                type="button"
                class="ghost"
                title=${t('home.refreshTitle')}
                ?disabled=${data.deploymentsLoading || data.linksPending > 0}
                @click=${() => {
                  this.refresh({ force: true, forceLinks: true });
                  void loadPlatformStatus({ force: true });
                }}
              >
                ${t('common.refresh')}
              </button>
            </div>
            <div class="row toolbar">
              <label class="field filter">
                <span class="muted small">${t('home.filter')}</span>
                <input
                  type="search"
                  name="filter"
                  placeholder=${t('home.filterPlaceholder')}
                  aria-label=${t('home.filterAria')}
                  autocomplete="off"
                  spellcheck="false"
                  .value=${this.filterText}
                  @input=${(event: Event) => (this.filterText = (event.currentTarget as HTMLInputElement).value)}
                />
              </label>
              <label class="field grouping">
                <span class="muted small">${t('home.groupBy')}</span>
                <input
                  type="text"
                  name="grouping"
                  list="grouping-suggestions"
                  placeholder=${t('home.groupByPlaceholder')}
                  aria-label=${t('home.groupBy')}
                  autocomplete="off"
                  spellcheck="false"
                  .value=${this.groupingText}
                  @input=${(event: Event) => this.setGrouping((event.currentTarget as HTMLInputElement).value)}
                />
                <datalist id="grouping-suggestions">
                  ${suggestions.map((suggestion) => html`<option value=${suggestion}></option>`)}
                </datalist>
              </label>
              <label class="small check">
                <input
                  type="checkbox"
                  .checked=${this.prefs.showAddons}
                  @change=${(event: Event) => this.setPrefs({ showAddons: (event.currentTarget as HTMLInputElement).checked })}
                />
                ${t('home.addons')}
              </label>
            </div>
            <p class="muted small hint">
              ${
                filter.error != null
                  ? html`<span class="danger">${t('home.filterError', { error: filter.error })}</span>`
                  : grouping.error != null
                    ? html`<span class="danger">${t('home.groupingError', { error: grouping.error })}</span>`
                    : html`<code>is:app</code> <code>is:node</code> <code>is:watch</code> <code>project:shop</code>
                        <code>env:prod</code> <code>has:project</code> <code>-env:prod</code> <code>AND</code>
                        <code>OR</code> <code>( )</code> <span class="sep">·</span> <code>project > env(prod,dev)</code>
                        <code>type</code> <code>runtime</code> <code>state</code>`
              }
              ${data.deploymentsError ? html`<span class="danger">${t('home.activityUnavailable', { error: data.deploymentsError })}</span>` : nothing}
              ${data.linksError ? html`<span class="danger">${t('home.linksIncomplete', { error: data.linksError })}</span>` : nothing}
            </p>
            ${this.renderSelectionBar()}
          </header>
          ${visibleApps.length + visibleAddons.length > 0 ? this.renderColumns() : nothing}
          ${
            tree.length === 1 && tree[0].level === 0
              ? this.renderTable(tree[0], activity, context, data.linksPending > 0, costs)
              : repeat(
                  tree,
                  (node) => node.path,
                  (node) => this.renderSection(node, activity, context, data.linksPending > 0, costs),
                )
          }
          ${
            visibleApps.length + visibleAddons.length === 0
              ? html`<p class="empty">
                  ${this.filterText.trim() === '' ? t('home.nothing') : t('home.noMatch', { query: this.filterText })}
                </p>`
              : this.renderListTotal(tree, visibleApps.length + visibleAddons.length, costs)
          }
        </div>
        <aside class="side ${this.sideTall ? 'tall' : ''}">
          <cvc-platform-status></cvc-platform-status>
          ${this.renderCostCard(visibleApps, visibleAddons, costs)} ${this.renderWatch(watch)}
          ${this.renderRecents(recents)}
        </aside>
      </div>
      ${
        this.tagDialog != null
          ? html`<cvc-tag-dialog
              .client=${this.client}
              ownerId=${this.orga.id}
              .resources=${this.selectedResources}
              .suggestions=${allTags}
              kind=${this.tagDialog}
              @cvc-tag-close=${() => (this.tagDialog = null)}
              @cvc-tags-applied=${this.onTagsApplied}
            ></cvc-tag-dialog>`
          : nothing
      }
      ${
        this.bulkDialog != null
          ? html`<cvc-bulk-dialog
              .client=${this.client}
              ownerId=${this.orga.id}
              kind=${this.bulkDialog}
              .apps=${this.selectedApps}
              .addons=${this.selectedAddonCount}
              @cvc-bulk-close=${() => (this.bulkDialog = null)}
              @cvc-bulk-done=${this.onBulkDone}
            ></cvc-bulk-dialog>`
          : nothing
      }
    `;
  }

  /** What the selection allows; the "select all" box itself sits in the column headers. */
  private renderSelectionBar() {
    const total = this.#order.length;
    const count = this.selected.size;
    const hasApps = this.orga.applications.some((app) => this.selected.has(app.id));
    return html`<div class="selection row ${count > 0 ? 'active' : ''}">
      ${
        count === 0
          ? html`<span class="muted small">${t('home.selectionIdle')}</span>`
          : html`<span class="small">${t('home.selected', { count, total })}</span>
              <button type="button" class="link small" @click=${this.clearSelection}>${t('home.selectNone')}</button>
              <span class="muted small">${t('home.selectionHint')}</span>
              <span class="grow"></span>
              <button type="button" @click=${() => (this.tagDialog = 'add')}>${t('home.addTag')}</button>
              <button type="button" @click=${() => (this.tagDialog = 'remove')}>${t('home.removeTag')}</button>
              <button type="button" @click=${() => (this.tagDialog = 'rename')}>${t('home.renameTag')}</button>
              <span class="sep"></span>
              <button type="button" ?disabled=${!hasApps} @click=${() => (this.bulkDialog = 'restart')}>
                ${t('home.restart')}
              </button>
              <button type="button" ?disabled=${!hasApps} @click=${() => (this.bulkDialog = 'stop')}>
                ${t('home.stop')}
              </button>`
      }
    </div>`;
  }

  private renderWatch(items: WatchItem[]) {
    if (items.length === 0) {
      return nothing;
    }
    const filtering = /(^|\s)is:watch(\s|$)/i.test(this.filterText);
    return html`<section class="watch card">
      <div class="row card-head">
        <h2>${t('home.watch')} <span class="count">${items.length}</span></h2>
        <span class="grow"></span>
        <button
          type="button"
          class="link ${filtering ? 'on' : ''}"
          title=${t('home.watchFilter')}
          aria-pressed=${filtering}
          @click=${() => (this.filterText = toggleToken(this.filterText, 'is:watch'))}
        >
          is:watch
        </button>
      </div>
      <ul>
        ${items.map((item) => {
          const { label, tone } = WATCH_LABELS[item.kind];
          return html`<li>
            <span class="row">
              <span class="badge ${tone}">${t(label)}</span>
              <a href=${this.appHash(item.app.id, item.kind === 'failed' ? 'deployments' : 'overview')}
                >${item.app.name}</a
              >
            </span>
            <span class="muted small">${this.describeWatch(item)}</span>
          </li>`;
        })}
      </ul>
    </section>`;
  }

  private describeWatch(item: WatchItem): string {
    const deployment = item.deployment;
    switch (item.kind) {
      case 'failed':
        return deployment == null
          ? t('watch.failedLast')
          : t('watch.failedAt', {
              when: formatRelative(deployment.date),
              who: describeOrigin(deployment, this.userId),
            });
      case 'deploying':
        return deployment != null && isInProgress(deployment)
          ? t('watch.inProgress', {
              action: deploymentActionLabel(deployment.action) || t('deploymentAction.DEPLOY'),
              when: formatRelative(deployment.date),
              who: describeOrigin(deployment, this.userId),
            })
          : t('watch.startRequested');
      case 'moderated':
        return t('watch.moderatedText');
      case 'payment':
        return t('watch.paymentText');
    }
  }

  private renderRecents(visits: RecentApp[]) {
    if (visits.length === 0) {
      return nothing;
    }
    return html`<section class="recents card">
      <h2>${t('home.recents')}</h2>
      <p class="muted small">${t('home.recentsHint')}</p>
      <div class="row chips">
        ${visits.map(
          ({ app, at }) =>
            html`<a
              class="chip"
              href=${this.appHash(app.id)}
              title=${t('home.recentVisit', { when: formatRelative(at) })}
              >${app.name}</a
            >`,
        )}
      </div>
    </section>`;
  }

  private counts(node: GroupNode): string {
    return [
      node.appCount > 0 ? t('home.apps', { count: node.appCount }) : '',
      node.addonCount > 0 ? t('home.addonsCount', { count: node.addonCount }) : '',
    ]
      .filter((part) => part !== '')
      .join(' · ');
  }

  /** Ids of the visible rows, in display order, from an already sorted tree. */
  private displayOrder(nodes: GroupNode[]): string[] {
    const order: string[] = [];
    const walk = (node: GroupNode) => {
      if (node.level > 0 && this.prefs.collapsed.includes(node.path)) {
        return;
      }
      if (node.children.length > 0) {
        node.children.forEach(walk);
        return;
      }
      order.push(...node.apps.map((app) => app.id), ...node.addons.map((addon) => addon.id));
    };
    nodes.forEach(walk);
    return order;
  }

  private renderColgroup() {
    return html`<colgroup>
      <col class="check" />
      <col class="logo" />
      <col class="name" />
      <col class="type" />
      <col class="state" />
      <col class="activity" />
      <col class="links" />
      ${this.prefs.costs ? html`<col class="cost" />` : nothing}
    </colgroup>`;
  }

  /** The column headers: one table above the groups, so they line up with every list below. */
  private renderColumns() {
    const total = this.#order.length;
    const count = this.selected.size;
    const all = total > 0 && count === total;
    return html`<table class="list columns">
      ${this.renderColgroup()}
      <thead>
        <tr>
          <th class="check">
            <input
              type="checkbox"
              aria-label=${t('home.selectAll', { count: total })}
              title=${t('home.selectAll', { count: total })}
              .checked=${all}
              .indeterminate=${count > 0 && !all}
              ?disabled=${total === 0}
              @change=${(event: Event) =>
                (event.currentTarget as HTMLInputElement).checked ? this.selectAll() : this.clearSelection()}
            />
          </th>
          <th class="logo"></th>
          ${this.renderSortHeader('name')} ${this.renderSortHeader('type')} ${this.renderSortHeader('state')}
          ${this.renderSortHeader('activity')} ${this.renderSortHeader('links')}
          ${this.prefs.costs ? this.renderSortHeader('cost') : nothing}
        </tr>
      </thead>
    </table>`;
  }

  private renderSortHeader(column: SortColumn) {
    const { column: active, direction } = this.prefs.sort;
    const on = active === column;
    const label = t(COLUMN_LABELS[column]);
    return html`<th class=${column} aria-sort=${on ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        class="sort ${on ? 'on' : ''}"
        title=${t('home.sortBy', { column: label })}
        @click=${() => this.setPrefs({ sort: toggleSort(this.prefs.sort, column) })}
      >
        ${label}<span class="arrow">${on ? (direction === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>`;
  }

  private renderSection(
    node: GroupNode,
    activity: Map<string, AppActivity>,
    context: GroupingContext,
    linksLoading: boolean,
    costs: CostTable | null,
  ) {
    const collapsed = this.prefs.collapsed.includes(node.path);
    return html`<section class="group ${node.missing ? 'missing' : ''}">
      <div class="group-head">
        ${this.renderGroupCheck(node)}
        <button
          type="button"
          class="group-toggle"
          aria-expanded=${!collapsed}
          @click=${() => this.toggleGroup(node.path)}
        >
          <span class="chevron">${collapsed ? '▸' : '▾'}</span>
          <span class="group-name">${node.label}</span>
          <span class="muted small">${this.counts(node)}</span>
        </button>
        ${this.renderGroupCost(node, costs)}
      </div>
      ${collapsed ? nothing : this.renderTable(node, activity, context, linksLoading, costs)}
    </section>`;
  }

  /** The box that selects or clears every resource of a group, sub-groups included. */
  private renderGroupCheck(node: GroupNode) {
    const ids = this.groupIds(node);
    const all = ids.length > 0 && ids.every((id) => this.selected.has(id));
    const some = !all && ids.some((id) => this.selected.has(id));
    return html`<input
      type="checkbox"
      class="group-check"
      aria-label=${t('home.selectGroup', { name: node.label })}
      title=${t('home.selectGroup', { name: node.label })}
      .checked=${all}
      .indeterminate=${some}
      ?disabled=${ids.length === 0}
      @change=${() => this.toggleGroupSelection(ids, !all)}
    />`;
  }

  /** What a cost shows before its source answered: a spinner, or a dash when there is nothing to wait for. */
  private renderCostPlaceholder() {
    return this.#costsPending ? html`<span class="spinner"></span>` : '—';
  }

  private renderGroupCost(node: GroupNode, costs: CostTable | null) {
    if (!this.prefs.costs) {
      return nothing;
    }
    return html`<span class="grow"></span>
      <span class="cost small ${costs == null ? 'muted' : ''}"
        >${costs == null ? this.renderCostPlaceholder() : formatMoney(nodeCost(node, costs), costs.currency)}</span
      >`;
  }

  private renderTable(
    node: GroupNode,
    activity: Map<string, AppActivity>,
    context: GroupingContext,
    linksLoading: boolean,
    costs: CostTable | null,
  ) {
    return html`<table class="list">
      ${this.renderColgroup()}
      <tbody>
        ${this.renderRows(node, activity, context, linksLoading, costs)}
      </tbody>
    </table>`;
  }

  private renderRows(
    node: GroupNode,
    activity: Map<string, AppActivity>,
    context: GroupingContext,
    linksLoading: boolean,
    costs: CostTable | null,
  ): unknown {
    if (node.children.length > 0) {
      return repeat(
        node.children,
        (child) => child.path,
        (child) => {
          const collapsed = this.prefs.collapsed.includes(child.path);
          return html`<tr class="sub level-${child.level} ${child.missing ? 'missing' : ''}">
              <td colspan=${this.#columns}>
                <div class="sub-head">
                  ${this.renderGroupCheck(child)}
                  <button
                    type="button"
                    class="group-toggle"
                    aria-expanded=${!collapsed}
                    @click=${() => this.toggleGroup(child.path)}
                  >
                    <span class="chevron">${collapsed ? '▸' : '▾'}</span>
                    <span class="group-name">${child.label}</span>
                    <span class="muted small">${this.counts(child)}</span>
                  </button>
                  ${this.renderGroupCost(child, costs)}
                </div>
              </td>
            </tr>
            ${collapsed ? nothing : this.renderRows(child, activity, context, linksLoading, costs)}`;
        },
      );
    }
    return html`
      ${repeat(
        node.apps,
        (app) => app.id,
        (app) => this.renderAppRow(app, activity.get(app.id), context, linksLoading, costs),
      )}
      ${repeat(
        node.addons,
        (addon) => addon.id,
        (addon) => this.renderAddonRow(addon, context, node.inferred.has(addon.id), costs),
      )}
    `;
  }

  private renderCost(costs: CostTable | null, resource: { id: string; realId?: string }) {
    if (!this.prefs.costs) {
      return nothing;
    }
    if (costs == null) {
      return html`<td class="cost muted small">${this.renderCostPlaceholder()}</td>`;
    }
    const amount = shownCost(costs, resource);
    const ifStarted = costs.ifStarted?.get(resource.id);
    const title =
      ifStarted == null
        ? this.costTitle(costs)
        : t('costs.ifStarted', { amount: formatMoney(ifStarted, costs.currency) });
    return html`<td class="cost small ${amount == null || amount === 0 ? 'muted' : ''}" title=${title}>
      ${amount == null ? '—' : formatMoney(amount, costs.currency)}
    </td>`;
  }

  private costTitle(costs: CostTable): string {
    switch (costs.source) {
      case 'invoice':
        return t('costs.columnTitle.invoice', { number: costs.reference, month: formatMonth(costs.period?.from) });
      case 'yesterday':
        return t('costs.columnTitle.yesterday', { date: formatDay(costs.period?.from) });
      default:
        return t(COST_SOURCE_SPECS[costs.source].title);
    }
  }

  /** The total of the visible list, under the cost column, named after its source. */
  private renderListTotal(tree: GroupNode[], count: number, costs: CostTable | null) {
    if (!this.prefs.costs) {
      return nothing;
    }
    const { label, detail } = this.describeSource(this.prefs.costSource);
    const source = detail === '' ? label : `${label}, ${detail}`;
    return html`<div class="list-total" title=${costs == null ? nothing : this.costTitle(costs)}>
      <span class="muted small">${t('costs.listTotal', { count, source })}</span>
      <span class="cost small ${costs == null ? 'muted' : ''}"
        >${costs == null ? this.renderCostPlaceholder() : formatMoney(totalCost(tree, costs), costs.currency)}</span
      >
    </div>`;
  }

  /** Whether a source is still loading, so the list knows to show spinners rather than dashes. */
  private isSourcePending(source: CostSource): boolean {
    const data = this.costStore.get(this.orga.id);
    return data.loading || this.sourceState(source, data).pending;
  }

  /** The label of a source and what it covers: a date, a period, a month. */
  private describeSource(source: CostSource): { label: string; detail: string } {
    const ownerId = this.orga.id;
    const spec = COST_SOURCE_SPECS[source];
    switch (source) {
      case 'yesterday':
        return { label: t(spec.label), detail: formatDay(lastDays(1)[0]) };
      case 'days30': {
        const days = this.costStore.recentDays(ownerId);
        const label =
          days.length === 0 || days.length >= COST_DAYS
            ? t(spec.label)
            : t('costs.days30Partial', { count: days.length });
        const detail = days.length === 0 ? '' : `${formatDay(days[0].date)} – ${formatDay(days[days.length - 1].date)}`;
        return { label, detail };
      }
      case 'invoice': {
        const data = this.costStore.get(ownerId);
        return data.invoice == null
          ? { label: data.invoiceAt > 0 ? t('costs.noInvoice') : t(spec.label), detail: '' }
          : { label: t(spec.label), detail: formatMonth(data.invoice.from) };
      }
      case 'estimate':
        return { label: t(spec.label), detail: '' };
    }
  }

  /** The amount of one source and what is known of its loading. */
  private sourceState(
    source: CostSource,
    data: OwnerCosts,
  ): { value: number | null; pending: boolean; error: string | null; progress: string | null } {
    const ownerId = this.orga.id;
    const sum = (table: CostTable | null) =>
      table == null ? null : [...table.amounts.values()].reduce((total, amount) => total + amount, 0);
    switch (source) {
      case 'yesterday':
        return {
          value: dayTotal(this.costStore.yesterday(ownerId)),
          pending: data.daysPending > 0,
          error: data.daysError,
          progress: null,
        };
      case 'days30': {
        const pending = data.daysPending > 0;
        return {
          value: sum(this.costStore.table(ownerId, 'days30')),
          pending,
          error: data.daysError,
          progress: pending
            ? t('costs.daysProgress', { done: this.costStore.recentDays(ownerId).length, total: COST_DAYS })
            : null,
        };
      }
      case 'invoice':
        return {
          value: sum(this.costStore.table(ownerId, 'invoice')),
          pending: data.invoiceLoading,
          error: data.invoiceError,
          progress: null,
        };
      case 'estimate':
        return { value: sum(data.estimate), pending: data.estimateLoading, error: data.estimateError, progress: null };
    }
  }

  /**
   * The costs card: an invitation while the costs are off, then one line per
   * source, each a radio button that picks what the cost column shows. The
   * resources are the visible ones, so the card can say what the list leaves out.
   */
  private renderCostCard(apps: ApplicationSummary[], addons: AddonSummary[], costs: CostTable | null) {
    if (!this.prefs.costs) {
      return html`<section class="costs card">
        <h2>${t('costs.title')} <span class="muted small">${t('costs.taxExcluded')}</span></h2>
        <p class="muted small">${t('costs.intro')}</p>
        <button type="button" class="primary show" @click=${() => this.toggleCosts(true)}>${t('costs.show')}</button>
      </section>`;
    }
    const data = this.costStore.get(this.orga.id);
    const currency = data.currency ?? data.invoice?.currency ?? 'EUR';
    const errors = [...new Set([data.daysError, data.invoiceError, data.estimateError].filter((e) => e != null))];
    const unlisted = costs == null ? null : unlistedCost(costs, [...apps, ...addons]);
    return html`<section class="costs card">
      <div class="row card-head">
        <h2>${t('costs.title')} <span class="muted small">${t('costs.taxExcluded')}</span></h2>
        <span class="grow"></span>
        <button type="button" class="link text" @click=${() => this.toggleCosts(false)}>${t('costs.hide')}</button>
      </div>
      <div class="sources" role="radiogroup" aria-label=${t('costs.sourceAria')}>
        ${COST_SOURCES.map((source) => this.renderSource(source, data, currency))}
      </div>
      <p class="muted small">${t('costs.columnHint')}</p>
      ${errors.map((error) => html`<p class="danger small">${t('costs.unavailable', { error })}</p>`)}
      ${
        unlisted != null && unlisted.count > 0 && costs != null
          ? html`<p class="muted small">
              ${t('costs.unlisted', { amount: formatMoney(unlisted.amount, costs.currency), count: unlisted.count })}
            </p>`
          : nothing
      }
      <details>
        <summary>${t('costs.about')}</summary>
        <p>${t('costs.about1')}</p>
        <p>${t('costs.about2')}</p>
        <p>${t('costs.about3')}</p>
      </details>
    </section>`;
  }

  private renderSource(source: CostSource, data: OwnerCosts, currency: string) {
    const { label, detail } = this.describeSource(source);
    const state = this.sourceState(source, data);
    const pending = state.pending || data.loading;
    const selected = this.prefs.costSource === source;
    const amount =
      state.error != null && state.value == null
        ? html`<span class="danger" title=${state.error}>${t('costs.unavailableShort')}</span>`
        : pending && (state.value == null || state.progress != null)
          ? html`<span class="muted loading"
              ><span class="spinner"></span>${state.progress ?? t('costs.loading')}</span
            >`
          : state.value == null
            ? html`<span class="muted">—</span>`
            : formatMoney(state.value, currency);
    return html`<label class="source ${selected ? 'on' : ''}">
      <input
        type="radio"
        name="cost-source"
        .checked=${selected}
        @change=${() => this.setPrefs({ costSource: source })}
      />
      <span class="label">${label} ${detail === '' ? nothing : html`<span class="muted">${detail}</span>`}</span>
      <span class="amount">${amount}</span>
      <span class="hint muted">${t(COST_SOURCE_SPECS[source].hint)}</span>
    </label>`;
  }

  private renderCheck(id: string, name: string) {
    return html`<td class="check">
      <input
        type="checkbox"
        aria-label=${t('home.selectRow', { name })}
        .checked=${this.selected.has(id)}
        @click=${(event: MouseEvent) => this.toggleSelect(id, event.shiftKey)}
      />
    </td>`;
  }

  private renderAppRow(
    app: ApplicationSummary,
    activity: AppActivity | undefined,
    context: GroupingContext,
    linksLoading: boolean,
    costs: CostTable | null,
  ) {
    const status = stateLabel(APP_STATE_LABELS, app.state);
    const addons = linkedAddons(app.id, context);
    return html`<tr class="app ${this.selected.has(app.id) ? 'selected' : ''}">
      ${this.renderCheck(app.id, app.name)}
      <td class="logo"><img src=${app.variantLogoUrl} alt="" width="20" height="20" loading="lazy" /></td>
      <td class="name">
        <a href=${this.appHash(app.id)}>${app.name}</a>
        ${this.renderTags(app.customerTags)}
      </td>
      <td class="type muted small">${app.variantName}</td>
      <td class="state"><span class="badge ${status.tone}">${status.label}</span></td>
      ${this.renderActivity(activity)}
      <td class="links">
        ${addons
          .slice(0, MAX_LINK_ICONS)
          .map(
            (addon) =>
              html`<img
                class=${isWeak(addon) ? 'weak' : ''}
                src=${addon.logoUrl}
                alt=${addon.name}
                title="${addon.name} · ${addon.providerId}"
                width="18"
                height="18"
                loading="lazy"
              />`,
          )}
        ${addons.length > MAX_LINK_ICONS ? html`<span class="muted small">+${addons.length - MAX_LINK_ICONS}</span>` : nothing}
        ${context.links[app.id] == null && linksLoading ? html`<span class="muted small">…</span>` : nothing}
      </td>
      ${this.renderCost(costs, app)}
    </tr>`;
  }

  private renderActivity(activity: AppActivity | undefined) {
    if (activity == null) {
      return html`<td class="activity muted small">—</td>`;
    }
    const last = activity.last;
    const human = isHumanDeployment(last);
    const tone = last.state === 'FAILED' ? 'failed' : isInProgress(last) ? 'wip' : human ? '' : 'platform';
    const action = deploymentActionLabel(last.action) || t('deploymentAction.DEPLOY');
    const title = [
      `${action} ${stateLabel(DEPLOYMENT_STATE_LABELS, last.state).label} · ${formatDateTime(last.date)}`,
      last.cause ? t('activity.cause', { cause: last.cause }) : '',
      activity.lastHuman != null && activity.lastHuman !== last
        ? t('activity.lastHuman', {
            when: formatRelative(activity.lastHuman.date),
            who: describeOrigin(activity.lastHuman, this.userId),
          })
        : '',
    ]
      .filter((part) => part !== '')
      .join('\n');
    return html`<td class="activity small ${tone}" title=${title}>
      ${last.state === 'FAILED' ? '✕ ' : isInProgress(last) ? '● ' : ''}${formatRelative(last.date)},
      ${describeOrigin(last, this.userId)}
    </td>`;
  }

  private renderAddonRow(addon: AddonSummary, context: GroupingContext, inferred: boolean, costs: CostTable | null) {
    const apps = linkedApps(addon.id, context);
    return html`<tr class="addon ${this.selected.has(addon.id) ? 'selected' : ''}">
      ${this.renderCheck(addon.id, addon.name)}
      <td class="logo"><img src=${addon.logoUrl} alt="" width="20" height="20" loading="lazy" /></td>
      <td class="name">
        <span>${addon.name}</span>
        ${this.renderTags(addon.customerTags)}
        ${inferred ? html`<span class="tag inferred" title=${t('home.inferredTitle')}>${t('home.inferred')}</span>` : nothing}
      </td>
      <td class="type muted small">${addon.providerId}</td>
      <td class="state"><span class="badge neutral">add-on</span></td>
      <td class="activity muted small" title=${apps.map((app) => app.name).join('\n')}>
        ${apps.length === 0 ? t('home.notLinked') : apps.length === 1 ? apps[0].name : t('home.linkedApps', { count: apps.length })}
      </td>
      <td class="links">
        <a class="small muted" href="${CONSOLE_URL}/goto/${addon.id}" target="_blank" rel="noopener"
          >${t('common.console')}</a
        >
      </td>
      ${this.renderCost(costs, addon)}
    </tr>`;
  }

  private renderTags(tags: string[]) {
    return tags.map(
      (tag) =>
        html`<button type="button" class="tag" title=${t('home.filterTag')} @click=${() => this.toggleTag(tag)}>
          ${tag}
        </button>`,
    );
  }

  private appHash(appId: string, tab: 'overview' | 'deployments' = 'overview'): string {
    return routeToHash({ kind: 'app', ownerId: this.orga.id, appId, tab });
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: 1.25rem;
        align-items: start;
      }
      .main {
        min-width: 0;
      }
      .side {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        position: sticky;
        top: 0;
      }
      .side.tall {
        position: static;
      }
      .grow {
        flex: 1;
      }
      .head {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        margin-bottom: 1rem;
      }
      .toolbar {
        align-items: flex-end;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .field.filter {
        flex: 1 1 320px;
        min-width: 220px;
      }
      .field.grouping {
        flex: 0 1 260px;
        min-width: 180px;
      }
      .field input {
        font-family: var(--cvc-mono);
        font-size: 0.9rem;
        width: 100%;
      }
      .seg {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        padding-bottom: 0.3rem;
      }
      .seg > span {
        margin-right: 0.3rem;
      }
      .seg button {
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.82rem;
        background: transparent;
      }
      .seg button.on {
        background: var(--cvc-text);
        color: var(--cvc-bg);
        border-color: transparent;
      }
      label.check {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        cursor: pointer;
      }
      .toolbar .check {
        padding-bottom: 0.5rem;
      }
      label.check input {
        margin: 0;
      }
      .hint code {
        margin-right: 0.5rem;
      }
      .hint .sep {
        margin-right: 0.5rem;
      }
      .hint .danger {
        color: var(--cvc-danger);
      }
      .selection {
        padding: 0.35rem 0.6rem;
        border: 1px solid transparent;
        border-radius: var(--cvc-radius);
        min-height: 2.4rem;
      }
      .selection.active {
        background: color-mix(in srgb, var(--cvc-accent) 7%, var(--cvc-surface));
        border-color: color-mix(in srgb, var(--cvc-accent) 35%, var(--cvc-border));
      }
      .selection .sep {
        width: 1px;
        height: 1.2rem;
        margin: 0 0.2rem;
        background: var(--cvc-border);
      }
      .selection button:not(.link) {
        padding: 0.25rem 0.7rem;
        font-size: 0.85rem;
      }

      .side .card {
        padding: 0.75rem 1rem;
      }
      .side h2 {
        margin: 0 0 0.4rem;
        font-size: 0.95rem;
      }
      .card-head {
        gap: 0.5rem;
        margin-bottom: 0.4rem;
      }
      .card-head h2 {
        margin: 0;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5em;
        padding: 0 0.45em;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 600;
        line-height: 1.6;
        color: var(--cvc-warn);
        background: color-mix(in srgb, var(--cvc-warn) 14%, transparent);
      }
      .card-head .link {
        font-family: var(--cvc-mono);
        font-size: 0.8rem;
        text-decoration: none;
        color: var(--cvc-muted);
      }
      .card-head .link:hover,
      .card-head .link.on {
        color: var(--cvc-accent);
      }
      .watch {
        border-color: color-mix(in srgb, var(--cvc-warn) 45%, var(--cvc-border));
      }
      .watch ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .watch li {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }
      .watch li .row {
        gap: 0.4rem;
        flex-wrap: nowrap;
        min-width: 0;
      }
      .watch li a {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .watch a {
        font-weight: 500;
        text-decoration: none;
      }
      .watch a:hover {
        text-decoration: underline;
      }

      .recents p {
        margin-bottom: 0.5rem;
      }
      .recents .chips {
        gap: 0.35rem;
      }
      .chip {
        text-decoration: none;
        font-size: 0.85rem;
        padding: 0.15rem 0.65rem;
        border: 1px solid var(--cvc-border);
        border-radius: 999px;
        background: var(--cvc-surface);
      }
      .chip:hover {
        border-color: var(--cvc-accent);
      }

      .group {
        margin-bottom: 0.9rem;
      }
      .group-head,
      .sub-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        box-sizing: border-box;
        padding: 0.3rem 0.4rem 0.3rem 0.65rem;
        font-weight: 600;
      }
      .group-toggle {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
        text-align: left;
        background: transparent;
        border: none;
        padding: 0;
        font: inherit;
        font-weight: 600;
        color: inherit;
        cursor: pointer;
      }
      .group-check {
        margin: 0;
        flex: none;
      }
      .group-head:hover,
      .sub-head:hover {
        background: color-mix(in srgb, var(--cvc-muted) 10%, transparent);
      }
      .group.missing .group-name,
      tr.missing .group-name {
        color: var(--cvc-muted);
        font-weight: 500;
      }
      .chevron {
        width: 1em;
        color: var(--cvc-muted);
      }
      tr.sub td {
        padding: 0.15rem 0.3rem;
        background: color-mix(in srgb, var(--cvc-muted) 6%, transparent);
      }
      tr.sub.level-3 .sub-head {
        padding-left: 1.6rem;
        font-size: 0.9rem;
      }
      .sub-head {
        padding: 0.15rem 0.4rem 0.15rem 0.3rem;
        font-size: 0.95rem;
      }

      table.list {
        border-collapse: separate;
        border-spacing: 0;
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
        font-size: 0.9rem;
        table-layout: fixed;
      }
      .list td {
        padding: 0.3rem 0.55rem;
        vertical-align: middle;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        border-bottom: 1px solid var(--cvc-border);
      }
      .list tr:last-child td {
        border-bottom: none;
      }
      .list tr.app:hover td,
      .list tr.addon:hover td {
        background: color-mix(in srgb, var(--cvc-accent) 5%, transparent);
      }
      .list tr.selected td {
        background: color-mix(in srgb, var(--cvc-accent) 9%, transparent);
      }
      col.check {
        width: 2rem;
      }
      col.logo {
        width: 2.2rem;
      }
      col.type {
        width: 9rem;
      }
      col.state {
        width: 8rem;
      }
      col.activity {
        width: 15rem;
      }
      col.links {
        width: 11rem;
      }
      col.cost {
        width: 6.5rem;
      }
      td.cost {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .group-head .cost,
      .sub-head .cost {
        font-variant-numeric: tabular-nums;
        font-weight: 500;
        padding-right: 0.55rem;
      }
      .list-total {
        display: flex;
        justify-content: flex-end;
        align-items: baseline;
        gap: 0.75rem;
        padding: 0.4rem 0.4rem 0;
      }
      .list-total .cost {
        min-width: 6.5rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        padding-right: 0.55rem;
      }
      .costs p {
        margin: 0.5rem 0 0;
      }
      .costs .show {
        margin-top: 0.6rem;
        padding: 0.3rem 0.8rem;
        font-size: 0.85rem;
      }
      .card-head .link.text {
        font-family: inherit;
      }
      .sources {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        margin: 0 -0.5rem;
      }
      .source {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
          'radio label amount'
          'radio hint hint';
        column-gap: 0.5rem;
        row-gap: 0.1rem;
        align-items: baseline;
        padding: 0.3rem 0.5rem;
        border-radius: var(--cvc-radius);
        cursor: pointer;
      }
      .source:hover {
        background: color-mix(in srgb, var(--cvc-muted) 8%, transparent);
      }
      .source.on {
        background: color-mix(in srgb, var(--cvc-accent) 8%, transparent);
      }
      .source input {
        grid-area: radio;
        margin: 0.2rem 0 0;
        align-self: start;
      }
      .source .label {
        grid-area: label;
        font-size: 0.85rem;
        color: var(--cvc-muted);
      }
      .source.on .label {
        color: var(--cvc-text);
        font-weight: 600;
      }
      .source .label .muted {
        font-weight: 400;
        white-space: nowrap;
      }
      .source .amount {
        grid-area: amount;
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-weight: 500;
        white-space: nowrap;
      }
      .source .hint {
        grid-area: hint;
        font-size: 0.78rem;
        line-height: 1.3;
      }
      .loading {
        font-size: 0.82rem;
        font-weight: 400;
      }
      .loading .spinner {
        margin-right: 0.35em;
      }
      .spinner {
        display: inline-block;
        width: 0.7em;
        height: 0.7em;
        border: 2px solid color-mix(in srgb, var(--cvc-muted) 30%, transparent);
        border-top-color: var(--cvc-accent);
        border-radius: 50%;
        vertical-align: -0.05em;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .costs details {
        margin-top: 0.6rem;
        font-size: 0.8rem;
        color: var(--cvc-muted);
      }
      .costs summary {
        cursor: pointer;
      }
      .costs details p {
        margin: 0.4rem 0 0;
        line-height: 1.35;
      }
      .costs .danger {
        color: var(--cvc-danger);
      }
      table.list.columns {
        background: transparent;
        border: none;
        margin-bottom: 0.3rem;
      }
      .columns th {
        padding: 0.1rem 0.55rem;
        text-align: left;
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--cvc-muted);
        white-space: nowrap;
        overflow: hidden;
      }
      .columns th.check {
        padding: 0 0.3rem 0 0.6rem;
      }
      .columns th.check input {
        margin: 0;
        display: block;
      }
      .columns th.cost {
        text-align: right;
      }
      .columns .sort {
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      .columns .sort:hover,
      .columns .sort.on {
        color: var(--cvc-text);
      }
      .columns .sort.on {
        font-weight: 600;
      }
      .columns .arrow {
        display: inline-block;
        width: 1em;
        margin-left: 0.2em;
        font-size: 0.7em;
        vertical-align: 0.1em;
      }
      td.check {
        padding: 0 0.3rem 0 0.6rem;
        user-select: none;
      }
      td.check input {
        margin: 0;
        display: block;
      }
      td.logo {
        padding-right: 0;
        padding-left: 0.3rem;
      }
      td.logo img {
        display: block;
        border-radius: 4px;
      }
      td.name a,
      td.name > span:first-child {
        font-weight: 500;
        text-decoration: none;
      }
      td.name a:hover {
        color: var(--cvc-accent);
        text-decoration: underline;
      }
      .tag {
        margin-left: 0.4rem;
        padding: 0 0.45rem;
        font-size: 0.72rem;
        line-height: 1.4;
        border-radius: 999px;
        color: var(--cvc-info);
        background: color-mix(in srgb, var(--cvc-info) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--cvc-info) 30%, transparent);
      }
      .tag.inferred {
        color: var(--cvc-muted);
        background: transparent;
        border-style: dashed;
        border-color: var(--cvc-border);
        font-weight: 400;
      }
      td.activity.platform {
        color: var(--cvc-muted);
      }
      td.activity.failed {
        color: var(--cvc-danger);
      }
      td.activity.wip {
        color: var(--cvc-warn);
      }
      td.links img {
        vertical-align: middle;
        margin-right: 0.2rem;
        border-radius: 4px;
      }
      td.links img.weak {
        opacity: 0.4;
      }
      td.links a {
        text-decoration: none;
      }
      @media (max-width: 1100px) {
        .layout {
          grid-template-columns: minmax(0, 1fr);
        }
        .side {
          order: -1;
          position: static;
          flex-direction: row;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }
        .side > * {
          flex: 1 1 260px;
          min-width: 0;
        }
      }
      @media (max-width: 960px) {
        td.type,
        th.type,
        td.links,
        th.links {
          display: none;
        }
        col.type,
        col.links {
          width: 0;
        }
        col.activity {
          width: 11rem;
        }
      }
    `,
  ];
}

function prefsKey(ownerId: string): string {
  return `cvc.home.${ownerId}`;
}

function readPrefs(ownerId: string): HomePrefs {
  try {
    const raw = localStorage.getItem(prefsKey(ownerId));
    if (raw == null) {
      return DEFAULT_PREFS;
    }
    const parsed = JSON.parse(raw) as Partial<HomePrefs>;
    return {
      grouping: typeof parsed.grouping === 'string' ? parsed.grouping : null,
      sort: readSort(parsed.sort),
      showAddons: parsed.showAddons !== false,
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.filter((id) => typeof id === 'string') : [],
      costs: parsed.costs === true,
      costSource: COST_SOURCES.includes(parsed.costSource as CostSource) ? (parsed.costSource as CostSource) : 'days30',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Accepts a stored spec, and the `name` / `activity` words of the toggle that came before the column headers. */
function readSort(value: unknown): SortSpec {
  if (value === 'activity') {
    return { column: 'activity', direction: 'desc' };
  }
  if (typeof value === 'object' && value != null) {
    const { column, direction } = value as Partial<SortSpec>;
    if (SORT_COLUMNS.includes(column as SortColumn)) {
      return { column: column as SortColumn, direction: direction === 'desc' ? 'desc' : 'asc' };
    }
  }
  return DEFAULT_PREFS.sort;
}

function writePrefs(ownerId: string, prefs: HomePrefs): void {
  try {
    localStorage.setItem(prefsKey(ownerId), JSON.stringify(prefs));
  } catch {
    // Not essential.
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-orga-page': CvcOrgaPage;
  }
}
