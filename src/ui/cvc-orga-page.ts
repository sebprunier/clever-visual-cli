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
import type { HomeStore } from '../core/home/home-store.js';
import { loadPlatformStatus } from '../core/home/platform-status.js';
import { listRecents } from '../core/home/recents.js';
import { apiExecutor, invertSteps, runSteps, type TagResource, type TagStep } from '../core/home/tagging.js';
import { readHashParams, routeToHash, writeHashParams } from '../core/router.js';
import type { AddonSummary, ApplicationSummary, Deployment, OrganisationSummary } from '../data/api.js';
import './cvc-platform-status.js';
import './cvc-tag-dialog.js';
import type { TagOperationKind, TagsAppliedDetail } from './cvc-tag-dialog.js';
import { pushToast, requestSummaryRefresh } from './shared/events.js';
import {
  APP_STATE_LABELS,
  deploymentActionLabel,
  DEPLOYMENT_STATE_LABELS,
  formatDateTime,
  formatRelative,
  stateLabel,
} from './shared/format.js';
import { sharedStyles } from './shared/styles.js';

type SortMode = 'name' | 'activity';

interface HomePrefs {
  grouping: string | null;
  sort: SortMode;
  showAddons: boolean;
  collapsed: string[];
}

/** An application opened in this browser, with the time of the last visit. */
interface RecentApp {
  app: ApplicationSummary;
  at: number;
}

const DEFAULT_PREFS: HomePrefs = { grouping: null, sort: 'name', showAddons: true, collapsed: [] };
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
  /** Id of the signed-in user, to say "toi" in the activity column. */
  @property() userId = '';
  /** Bumped by the shell after an action so the activity reloads. */
  @property({ type: Number }) revision = 0;

  @state() private filterText = '';
  @state() private groupingText = '';
  @state() private prefs: HomePrefs = DEFAULT_PREFS;
  @state() private selected: ReadonlySet<string> = new Set();
  @state() private tagDialog: TagOperationKind | null = null;

  @query('input[name="filter"]') private filterInput?: HTMLInputElement;

  #activitySource: readonly Deployment[] | null = null;
  #activity: Map<string, AppActivity> = new Map();
  /** Ids of the visible rows in display order, for shift-click ranges and "select all". */
  #order: string[] = [];
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
    } else if (event.key === 'Escape' && !event.defaultPrevented && this.tagDialog == null && this.selected.size > 0) {
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
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues): void {
    if (changed.has('store')) {
      (changed.get('store') as HomeStore | undefined)?.removeEventListener('change', this.onStoreChange);
      this.store?.addEventListener('change', this.onStoreChange);
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

  private selectAll(): void {
    this.selected = new Set(this.#order);
  }

  private clearSelection(): void {
    this.selected = new Set();
    this.#lastClicked = null;
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
    const tree = buildTree(grouping, visibleApps, visibleAddons, context);
    this.#order = this.displayOrder(tree, activity);
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
              <div class="seg" role="group" aria-label=${t('home.sort')}>
                <span class="muted small">${t('home.sort')}</span>
                <button
                  type="button"
                  class=${this.prefs.sort === 'name' ? 'on' : ''}
                  aria-pressed=${this.prefs.sort === 'name'}
                  @click=${() => this.setPrefs({ sort: 'name' })}
                >
                  ${t('home.sortName')}
                </button>
                <button
                  type="button"
                  class=${this.prefs.sort === 'activity' ? 'on' : ''}
                  aria-pressed=${this.prefs.sort === 'activity'}
                  title=${t('home.sortActivityTitle')}
                  @click=${() => this.setPrefs({ sort: 'activity' })}
                >
                  ${t('home.sortActivity')}
                </button>
              </div>
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
          ${
            tree.length === 1 && tree[0].level === 0
              ? this.renderTable(tree[0], activity, context, data.linksPending > 0)
              : repeat(
                  tree,
                  (node) => node.path,
                  (node) => this.renderSection(node, activity, context, data.linksPending > 0),
                )
          }
          ${
            visibleApps.length + visibleAddons.length === 0
              ? html`<p class="empty">
                  ${this.filterText.trim() === '' ? t('home.nothing') : t('home.noMatch', { query: this.filterText })}
                </p>`
              : nothing
          }
        </div>
        <aside class="side">
          <cvc-platform-status></cvc-platform-status>
          ${this.renderWatch(watch)} ${this.renderRecents(recents)}
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
    `;
  }

  private renderSelectionBar() {
    const total = this.#order.length;
    const count = this.selected.size;
    const all = total > 0 && count === total;
    return html`<div class="selection row ${count > 0 ? 'active' : ''}">
      <label class="check">
        <input
          type="checkbox"
          aria-label=${t('home.selectAllAria')}
          .checked=${all}
          .indeterminate=${count > 0 && !all}
          ?disabled=${total === 0}
          @change=${(event: Event) => ((event.currentTarget as HTMLInputElement).checked ? this.selectAll() : this.clearSelection())}
        />
        ${
          count === 0
            ? html`<span class="muted small">${t('home.selectAll', { count: total })}</span>`
            : html`<span class="small">${t('home.selected', { count, total })}</span>`
        }
      </label>
      ${
        count > 0
          ? html`<button type="button" class="link small" @click=${this.clearSelection}>${t('home.selectNone')}</button>
              <span class="muted small">${t('home.selectionHint')}</span>
              <span class="grow"></span>
              <button type="button" @click=${() => (this.tagDialog = 'add')}>${t('home.addTag')}</button>
              <button type="button" @click=${() => (this.tagDialog = 'remove')}>${t('home.removeTag')}</button>
              <button type="button" @click=${() => (this.tagDialog = 'rename')}>${t('home.renameTag')}</button>`
          : nothing
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
        <h2>${t('home.watch')} <span class="muted">${items.length}</span></h2>
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

  private sortedApps(node: GroupNode, activity: Map<string, AppActivity>): ApplicationSummary[] {
    if (this.prefs.sort !== 'activity') {
      return node.apps;
    }
    return [...node.apps].sort((a, b) =>
      (activity.get(b.id)?.last.date ?? '').localeCompare(activity.get(a.id)?.last.date ?? ''),
    );
  }

  /** Ids of the rows as displayed, collapsed groups excluded. */
  private displayOrder(nodes: GroupNode[], activity: Map<string, AppActivity>): string[] {
    const order: string[] = [];
    const walk = (node: GroupNode) => {
      if (node.level > 0 && this.prefs.collapsed.includes(node.path)) {
        return;
      }
      if (node.children.length > 0) {
        node.children.forEach(walk);
        return;
      }
      order.push(...this.sortedApps(node, activity).map((app) => app.id), ...node.addons.map((addon) => addon.id));
    };
    nodes.forEach(walk);
    return order;
  }

  private renderSection(
    node: GroupNode,
    activity: Map<string, AppActivity>,
    context: GroupingContext,
    linksLoading: boolean,
  ) {
    const collapsed = this.prefs.collapsed.includes(node.path);
    return html`<section class="group ${node.missing ? 'missing' : ''}">
      <button type="button" class="group-head" aria-expanded=${!collapsed} @click=${() => this.toggleGroup(node.path)}>
        <span class="chevron">${collapsed ? '▸' : '▾'}</span>
        <span class="group-name">${node.label}</span>
        <span class="muted small">${this.counts(node)}</span>
      </button>
      ${collapsed ? nothing : this.renderTable(node, activity, context, linksLoading)}
    </section>`;
  }

  private renderTable(
    node: GroupNode,
    activity: Map<string, AppActivity>,
    context: GroupingContext,
    linksLoading: boolean,
  ) {
    return html`<table class="list">
      <colgroup>
        <col class="check" />
        <col class="logo" />
        <col class="name" />
        <col class="type" />
        <col class="state" />
        <col class="activity" />
        <col class="links" />
      </colgroup>
      <tbody>
        ${this.renderRows(node, activity, context, linksLoading)}
      </tbody>
    </table>`;
  }

  private renderRows(
    node: GroupNode,
    activity: Map<string, AppActivity>,
    context: GroupingContext,
    linksLoading: boolean,
  ): unknown {
    if (node.children.length > 0) {
      return repeat(
        node.children,
        (child) => child.path,
        (child) => {
          const collapsed = this.prefs.collapsed.includes(child.path);
          return html`<tr class="sub level-${child.level} ${child.missing ? 'missing' : ''}">
              <td colspan=${COLUMNS}>
                <button
                  type="button"
                  class="sub-head"
                  aria-expanded=${!collapsed}
                  @click=${() => this.toggleGroup(child.path)}
                >
                  <span class="chevron">${collapsed ? '▸' : '▾'}</span>
                  <span class="group-name">${child.label}</span>
                  <span class="muted small">${this.counts(child)}</span>
                </button>
              </td>
            </tr>
            ${collapsed ? nothing : this.renderRows(child, activity, context, linksLoading)}`;
        },
      );
    }
    return html`
      ${repeat(
        this.sortedApps(node, activity),
        (app) => app.id,
        (app) => this.renderAppRow(app, activity.get(app.id), context, linksLoading),
      )}
      ${repeat(
        node.addons,
        (addon) => addon.id,
        (addon) => this.renderAddonRow(addon, context, node.inferred.has(addon.id)),
      )}
    `;
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

  private renderAddonRow(addon: AddonSummary, context: GroupingContext, inferred: boolean) {
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
        text-align: left;
        background: transparent;
        border: none;
        padding: 0.3rem 0.4rem;
        font-weight: 600;
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
        padding: 0.15rem 0.4rem;
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
        td.links {
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
      sort: parsed.sort === 'activity' ? 'activity' : 'name',
      showAddons: parsed.showAddons !== false,
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.filter((id) => typeof id === 'string') : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
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
