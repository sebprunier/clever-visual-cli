import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
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
  defaultGrouping,
  groupingSuggestions,
  isWeak,
  linkedAddons,
  linkedApps,
  parseGrouping,
  type GroupNode,
  type GroupingContext,
} from '../core/home/grouping.js';
import type { HomeStore } from '../core/home/home-store.js';
import { listRecents } from '../core/home/recents.js';
import { readHashParams, routeToHash, writeHashParams } from '../core/router.js';
import type { AddonSummary, ApplicationSummary, Deployment, OrganisationSummary } from '../data/api.js';
import {
  APP_STATE_LABELS,
  DEPLOYMENT_ACTION_LABELS,
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

const DEFAULT_PREFS: HomePrefs = { grouping: null, sort: 'name', showAddons: true, collapsed: [] };
const MAX_RECENTS = 8;
const MAX_LINK_ICONS = 6;

const WATCH_LABELS: Record<WatchItem['kind'], { label: string; tone: string }> = {
  failed: { label: 'échec', tone: 'danger' },
  deploying: { label: 'en cours', tone: 'warn' },
  moderated: { label: 'modérée', tone: 'danger' },
  payment: { label: 'impayé', tone: 'danger' },
};

/**
 * Home of one organisation: a dense, searchable list of applications and
 * add-ons, filtered and grouped by expressions, with what deserves
 * attention on top and the applications opened recently.
 */
@customElement('cvc-orga-page')
export class CvcOrgaPage extends LitElement {
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

  @query('input[name="filter"]') private filterInput?: HTMLInputElement;

  #activitySource: readonly Deployment[] | null = null;
  #activity: Map<string, AppActivity> = new Map();

  private readonly onStoreChange = () => this.requestUpdate();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.composedPath()[0];
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))
    ) {
      return;
    }
    event.preventDefault();
    this.filterInput?.focus();
    this.filterInput?.select();
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
        this.groupingText =
          params.get('g') ?? this.prefs.grouping ?? defaultGrouping([...this.orga.applications, ...this.orga.addons]);
      }
      this.refresh({});
    } else if (changed.has('revision')) {
      this.refresh({ force: true });
    }
    if (changed.has('filterText') || changed.has('groupingText')) {
      writeHashParams({ q: this.filterText.trim(), g: this.groupingText.trim() });
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
    const matchApp = (app: ApplicationSummary) =>
      matchesFilter(filter, {
        kind: 'app',
        name: app.name,
        slugs: [app.variantSlug, app.instanceType],
        runtime: app.variantName,
        state: stateLabel(APP_STATE_LABELS, app.state).label,
        tags: app.customerTags,
        extra: [app.id, ...linkedAddons(app.id, context).map((addon) => addon.name)],
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
    const watch = watchList(apps, activity);
    const appById = new Map(apps.map((app) => [app.id, app]));
    const recents = listRecents(this.orga.id)
      .map((visit) => appById.get(visit.appId))
      .filter((app): app is ApplicationSummary => app != null)
      .slice(0, MAX_RECENTS);
    const linksDone = apps.filter((app) => data.links[app.id] != null).length;
    const suggestions = groupingSuggestions([...apps, ...addons]);

    return html`
      <header class="head">
        <div class="row">
          <h1>${this.orga.name}</h1>
          <span class="muted small">${apps.length} applications · ${addons.length} add-ons</span>
          <span class="cli">clever applications list</span>
          <span class="grow"></span>
          ${
            data.linksPending > 0
              ? html`<span class="muted small" title="Liens applications ↔ add-ons"
                  >liens ${linksDone}/${apps.length}</span
                >`
              : data.deploymentsLoading
                ? html`<span class="muted small">activité…</span>`
                : nothing
          }
          <button
            type="button"
            class="ghost"
            title="Recharge l’activité et les liens"
            ?disabled=${data.deploymentsLoading || data.linksPending > 0}
            @click=${() => this.refresh({ force: true, forceLinks: true })}
          >
            Rafraîchir
          </button>
        </div>
        <div class="row toolbar">
          <label class="field filter">
            <span class="muted small">Filtrer</span>
            <input
              type="search"
              name="filter"
              placeholder="is:app AND env:prod   (touche /)"
              aria-label="Filtrer les applications et add-ons"
              autocomplete="off"
              spellcheck="false"
              .value=${this.filterText}
              @input=${(event: Event) => (this.filterText = (event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="field grouping">
            <span class="muted small">Regrouper par</span>
            <input
              type="text"
              name="grouping"
              list="grouping-suggestions"
              placeholder="project > env"
              aria-label="Regrouper par"
              autocomplete="off"
              spellcheck="false"
              .value=${this.groupingText}
              @input=${(event: Event) => this.setGrouping((event.currentTarget as HTMLInputElement).value)}
            />
            <datalist id="grouping-suggestions">
              ${suggestions.map((suggestion) => html`<option value=${suggestion}></option>`)}
            </datalist>
          </label>
          <div class="seg" role="group" aria-label="Trier par">
            <span class="muted small">Trier</span>
            <button
              type="button"
              class=${this.prefs.sort === 'name' ? 'on' : ''}
              aria-pressed=${this.prefs.sort === 'name'}
              @click=${() => this.setPrefs({ sort: 'name' })}
            >
              nom
            </button>
            <button
              type="button"
              class=${this.prefs.sort === 'activity' ? 'on' : ''}
              aria-pressed=${this.prefs.sort === 'activity'}
              title="Dernier déploiement en premier"
              @click=${() => this.setPrefs({ sort: 'activity' })}
            >
              activité
            </button>
          </div>
          <label class="small check">
            <input
              type="checkbox"
              .checked=${this.prefs.showAddons}
              @change=${(event: Event) => this.setPrefs({ showAddons: (event.currentTarget as HTMLInputElement).checked })}
            />
            add-ons
          </label>
        </div>
        <p class="muted small hint">
          ${
            filter.error != null
              ? html`<span class="danger">Filtre incomplet (${filter.error}), appliqué mot à mot.</span>`
              : grouping.error != null
                ? html`<span class="danger">Regroupement : ${grouping.error}.</span>`
                : html`<code>is:app</code> <code>is:node</code> <code>project:nom</code> <code>env:prod</code>
                    <code>has:project</code> <code>-env:prod</code> <code>AND</code> <code>OR</code> <code>( )</code>
                    <span class="sep">·</span> <code>project > env(prod,dev)</code> <code>type</code>
                    <code>runtime</code> <code>state</code>`
          }
          ${data.deploymentsError ? html`<span class="danger">· activité indisponible : ${data.deploymentsError}</span>` : nothing}
          ${data.linksError ? html`<span class="danger">· liens incomplets : ${data.linksError}</span>` : nothing}
        </p>
      </header>

      ${this.renderWatch(watch)} ${this.renderRecents(recents)}
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
              ${this.filterText.trim() === '' ? 'Rien à afficher.' : html`Rien ne correspond à « ${this.filterText} ».`}
            </p>`
          : nothing
      }
    `;
  }

  private renderWatch(items: WatchItem[]) {
    if (items.length === 0) {
      return nothing;
    }
    return html`<section class="watch card">
      <h2>À surveiller</h2>
      <ul>
        ${items.map((item) => {
          const { label, tone } = WATCH_LABELS[item.kind];
          return html`<li class="row">
            <span class="badge ${tone}">${label}</span>
            <a href=${this.appHash(item.app.id, item.kind === 'failed' ? 'deployments' : 'overview')}
              >${item.app.name}</a
            >
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
          ? 'dernier déploiement échoué'
          : `déploiement échoué ${formatRelative(deployment.date)} (${describeOrigin(deployment, this.userId)})`;
      case 'deploying':
        return deployment != null && isInProgress(deployment)
          ? `${DEPLOYMENT_ACTION_LABELS[deployment.action] || 'déploiement'} en cours, lancé ${formatRelative(deployment.date)} (${describeOrigin(deployment, this.userId)})`
          : 'démarrage demandé';
      case 'moderated':
        return 'application modérée par Clever Cloud';
      case 'payment':
        return 'défaut de paiement';
    }
  }

  private renderRecents(apps: ApplicationSummary[]) {
    if (apps.length === 0) {
      return nothing;
    }
    return html`<section class="recents row">
      <span class="muted small">Récents</span>
      ${apps.map((app) => html`<a class="chip" href=${this.appHash(app.id)}>${app.name}</a>`)}
    </section>`;
  }

  private counts(node: GroupNode): string {
    return [
      node.appCount > 0 ? `${node.appCount} app${node.appCount > 1 ? 's' : ''}` : '',
      node.addonCount > 0 ? `${node.addonCount} add-on${node.addonCount > 1 ? 's' : ''}` : '',
    ]
      .filter((part) => part !== '')
      .join(' · ');
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
              <td colspan="6">
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
    const byActivity = (a: ApplicationSummary, b: ApplicationSummary) =>
      (activity.get(b.id)?.last.date ?? '').localeCompare(activity.get(a.id)?.last.date ?? '');
    const apps = this.prefs.sort === 'activity' ? [...node.apps].sort(byActivity) : node.apps;
    return html`
      ${repeat(
        apps,
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

  private renderAppRow(
    app: ApplicationSummary,
    activity: AppActivity | undefined,
    context: GroupingContext,
    linksLoading: boolean,
  ) {
    const status = stateLabel(APP_STATE_LABELS, app.state);
    const addons = linkedAddons(app.id, context);
    return html`<tr class="app">
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
    const action = DEPLOYMENT_ACTION_LABELS[last.action] || 'déploiement';
    const title = [
      `${action} ${stateLabel(DEPLOYMENT_STATE_LABELS, last.state).label} · ${formatDateTime(last.date)}`,
      last.cause ? `cause : ${last.cause}` : '',
      activity.lastHuman != null && activity.lastHuman !== last
        ? `dernier déploiement humain : ${formatRelative(activity.lastHuman.date)} (${describeOrigin(activity.lastHuman, this.userId)})`
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
    return html`<tr class="addon">
      <td class="logo"><img src=${addon.logoUrl} alt="" width="20" height="20" loading="lazy" /></td>
      <td class="name">
        <span>${addon.name}</span>
        ${this.renderTags(addon.customerTags)}
        ${inferred ? html`<span class="tag inferred" title="Placé d’après les applications liées">déduit</span>` : nothing}
      </td>
      <td class="type muted small">${addon.providerId}</td>
      <td class="state"><span class="badge neutral">add-on</span></td>
      <td class="activity muted small" title=${apps.map((app) => app.name).join('\n')}>
        ${apps.length === 0 ? 'non lié' : apps.length === 1 ? apps[0].name : `${apps.length} applications`}
      </td>
      <td class="links">
        <a class="small muted" href="${CONSOLE_URL}/goto/${addon.id}" target="_blank" rel="noopener">Console ↗</a>
      </td>
    </tr>`;
  }

  private renderTags(tags: string[]) {
    return tags.map(
      (tag) =>
        html`<button type="button" class="tag" title="Filtrer sur ce tag" @click=${() => this.toggleTag(tag)}>
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
      .check {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        cursor: pointer;
        padding-bottom: 0.5rem;
      }
      .check input {
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

      .watch {
        padding: 0.75rem 1rem;
        margin-bottom: 1rem;
        border-color: color-mix(in srgb, var(--cvc-warn) 45%, var(--cvc-border));
      }
      .watch h2 {
        margin-bottom: 0.4rem;
      }
      .watch ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .watch a {
        font-weight: 500;
        text-decoration: none;
      }
      .watch a:hover {
        text-decoration: underline;
      }

      .recents {
        margin-bottom: 1rem;
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
      td.logo {
        padding-right: 0;
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
