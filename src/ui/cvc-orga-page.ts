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
import {
  buildGroups,
  GROUP_MODES,
  isWeak,
  linkedAddons,
  linkedApps,
  type GroupMode,
  type GroupingContext,
  type HomeGroup,
} from '../core/home/groups.js';
import type { HomeStore } from '../core/home/home-store.js';
import { matchesFilter, parseFilter, toggleToken } from '../core/home/filter.js';
import { listRecents } from '../core/home/recents.js';
import { routeToHash } from '../core/router.js';
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
  groupMode: GroupMode;
  sort: SortMode;
  showAddons: boolean;
  collapsed: string[];
}

const DEFAULT_PREFS: HomePrefs = { groupMode: 'stack', sort: 'name', showAddons: true, collapsed: [] };
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
 * add-ons, grouped by stack, project, runtime or state, with what deserves
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

  @state() private queryText = '';
  @state() private prefs: HomePrefs = DEFAULT_PREFS;

  @query('input[type="search"]') private searchInput?: HTMLInputElement;

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
    this.searchInput?.focus();
    this.searchInput?.select();
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

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('store')) {
      (changed.get('store') as HomeStore | undefined)?.removeEventListener('change', this.onStoreChange);
      this.store?.addEventListener('change', this.onStoreChange);
    }
    if (changed.has('orga')) {
      const previous = changed.get('orga') as OrganisationSummary | undefined;
      if (previous?.id !== this.orga.id) {
        this.queryText = '';
        this.prefs = readPrefs(this.orga.id);
      }
      this.refresh({});
    } else if (changed.has('revision')) {
      this.refresh({ force: true });
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

  private toggleGroup(id: string): void {
    const collapsed = this.prefs.collapsed.includes(id)
      ? this.prefs.collapsed.filter((candidate) => candidate !== id)
      : [...this.prefs.collapsed, id];
    this.setPrefs({ collapsed });
  }

  private toggleTag(tag: string): void {
    // A `key:value` tag is a filter term on its own; a bare tag goes through `tag:`.
    this.queryText = toggleToken(this.queryText, /^[^:\s]+:[^\s]+$/.test(tag) ? tag : `tag:${tag}`);
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
    const filter = parseFilter(this.queryText);
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
    const byActivity = (a: ApplicationSummary, b: ApplicationSummary) =>
      (activity.get(b.id)?.last.date ?? '').localeCompare(activity.get(a.id)?.last.date ?? '');
    const groups = buildGroups(this.prefs.groupMode, context)
      .map((group) => {
        const addons = this.prefs.showAddons ? group.addons.filter(matchAddon) : [];
        // In a nested group an add-on only shows under its application, so a matching add-on keeps its application.
        const keep = (app: ApplicationSummary) =>
          matchApp(app) ||
          (group.nested === true && addons.some((addon) => context.links[app.id]?.addonIds.includes(addon.id)));
        const kept = group.apps.filter(keep);
        return { ...group, apps: this.prefs.sort === 'activity' ? kept.sort(byActivity) : kept, addons };
      })
      .filter((group) => group.apps.length + group.addons.length > 0);
    const watch = watchList(apps, activity);
    const appById = new Map(apps.map((app) => [app.id, app]));
    const recents = listRecents(this.orga.id)
      .map((visit) => appById.get(visit.appId))
      .filter((app): app is ApplicationSummary => app != null)
      .slice(0, MAX_RECENTS);
    const linksDone = apps.filter((app) => data.links[app.id] != null).length;

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
          <input
            type="search"
            placeholder="Rechercher…  (touche /)"
            aria-label="Rechercher une application ou un add-on"
            autocomplete="off"
            spellcheck="false"
            .value=${this.queryText}
            @input=${(event: Event) => (this.queryText = (event.currentTarget as HTMLInputElement).value)}
          />
          <div class="seg" role="group" aria-label="Grouper par">
            <span class="muted small">Grouper</span>
            ${GROUP_MODES.map(
              (mode) =>
                html`<button
                  type="button"
                  class=${mode.id === this.prefs.groupMode ? 'on' : ''}
                  aria-pressed=${mode.id === this.prefs.groupMode}
                  title=${mode.hint}
                  @click=${() => this.setPrefs({ groupMode: mode.id })}
                >
                  ${mode.label}
                </button>`,
            )}
          </div>
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
              ? html`<span class="danger">Expression incomplète (${filter.error}), filtre appliqué mot à mot.</span>`
              : html`<code>is:app</code> <code>is:node</code> <code>project:nom</code> <code>env:prod</code>
                  <code>has:project</code> <code>-env:prod</code> <code>state:arrêtée</code> <code>AND</code>
                  <code>OR</code> <code>NOT</code> <code>( )</code> <code>"deux mots"</code>`
          }
          ${data.deploymentsError ? html`<span class="danger">· activité indisponible : ${data.deploymentsError}</span>` : nothing}
          ${data.linksError ? html`<span class="danger">· liens incomplets : ${data.linksError}</span>` : nothing}
        </p>
      </header>

      ${this.renderWatch(watch)} ${this.renderRecents(recents)}
      ${repeat(
        groups,
        (group) => group.id,
        (group) => this.renderGroup(group, activity, context, data.linksPending > 0),
      )}
      ${
        groups.length === 0
          ? html`<p class="empty">
              ${this.queryText.trim() === '' ? 'Rien à afficher.' : html`Rien ne correspond à « ${this.queryText} ».`}
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

  private renderGroup(
    group: HomeGroup,
    activity: Map<string, AppActivity>,
    context: GroupingContext,
    linksLoading: boolean,
  ) {
    const collapsed = this.prefs.collapsed.includes(group.id);
    const counts = [
      group.apps.length > 0 ? `${group.apps.length} app${group.apps.length > 1 ? 's' : ''}` : '',
      group.addons.length > 0 ? `${group.addons.length} add-on${group.addons.length > 1 ? 's' : ''}` : '',
    ]
      .filter((part) => part !== '')
      .join(' · ');
    return html`<section class="group ${group.kind}">
      <button type="button" class="group-head" aria-expanded=${!collapsed} @click=${() => this.toggleGroup(group.id)}>
        <span class="chevron">${collapsed ? '▸' : '▾'}</span>
        <span class="group-name">${group.name}</span>
        <span class="muted small">${counts}</span>
      </button>
      ${
        collapsed
          ? nothing
          : html`<table class="list">
              <tbody>
                ${repeat(
                  group.apps,
                  (app) => app.id,
                  (app) => html`
                    ${this.renderAppRow(app, activity.get(app.id), context, linksLoading)}
                    ${
                      group.nested === true
                        ? repeat(
                            group.addons.filter((addon) => context.links[app.id]?.addonIds.includes(addon.id)),
                            (addon) => addon.id,
                            (addon) => this.renderAddonRow(addon, context, true),
                          )
                        : nothing
                    }
                  `,
                )}
                ${
                  group.nested === true
                    ? nothing
                    : repeat(
                        group.addons,
                        (addon) => addon.id,
                        (addon) => this.renderAddonRow(addon, context),
                      )
                }
              </tbody>
            </table>`
      }
    </section>`;
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

  private renderAddonRow(addon: AddonSummary, context: GroupingContext, nested = false) {
    const apps = linkedApps(addon.id, context);
    return html`<tr class="addon ${nested ? 'nested' : ''}">
      <td class="logo"><img src=${addon.logoUrl} alt="" width="20" height="20" loading="lazy" /></td>
      <td class="name">
        ${nested ? html`<span class="muted branch">└</span>` : nothing}
        <span>${addon.name}</span>
        ${this.renderTags(addon.customerTags)}
      </td>
      <td class="type muted small">${addon.providerId}</td>
      <td class="state"><span class="badge neutral">add-on</span></td>
      <td class="activity muted small" title=${apps.map((app) => app.name).join('\n')}>
        ${
          nested && apps.length === 1
            ? ''
            : apps.length === 0
              ? 'non lié'
              : apps.length === 1
                ? apps[0].name
                : `${apps.length} applications`
        }
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
      .toolbar input[type='search'] {
        flex: 1 1 320px;
        min-width: 200px;
        font-family: var(--cvc-mono);
        font-size: 0.9rem;
      }
      .seg {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
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
      }
      .check input {
        margin: 0;
      }
      .hint code {
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
      .group-head {
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
      .group-head:hover {
        background: color-mix(in srgb, var(--cvc-muted) 10%, transparent);
      }
      .group.rest .group-name,
      .group.shared .group-name,
      .group.orphans .group-name {
        color: var(--cvc-muted);
      }
      .chevron {
        width: 1em;
        color: var(--cvc-muted);
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
      .list tr:hover td {
        background: color-mix(in srgb, var(--cvc-accent) 5%, transparent);
      }
      td.logo {
        width: 2rem;
        padding-right: 0;
      }
      td.logo img {
        display: block;
        border-radius: 4px;
      }
      td.name a,
      td.name > span {
        font-weight: 500;
        text-decoration: none;
      }
      td.name a:hover {
        color: var(--cvc-accent);
        text-decoration: underline;
      }
      tr.nested td.name {
        padding-left: 1.4rem;
      }
      tr.nested td.name > .branch {
        font-weight: 400;
        margin-right: 0.3rem;
      }
      tr.nested td.logo img {
        opacity: 0.85;
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
      td.type {
        width: 9rem;
      }
      td.state {
        width: 9rem;
      }
      td.activity {
        width: 15rem;
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
      td.links {
        width: 11rem;
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
        td.activity {
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
      groupMode: GROUP_MODES.some((mode) => mode.id === parsed.groupMode) ? parsed.groupMode! : DEFAULT_PREFS.groupMode,
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
