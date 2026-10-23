import { css, html, nothing, type PropertyValues } from 'lit';
import { CvcElement } from './shared/cvc-element.js';
import { customElement, query, state } from 'lit/decorators.js';
import {
  ACTIONS,
  findAction,
  offersAction,
  type ActionContext,
  type ActionDefinition,
  type ActionResult,
  type ActionValues,
} from '../core/actions.js';
import { isNewerRelease, latestRelease, releaseNotesUrl } from '../core/cli-release.js';
import { clearClientCaches } from '../core/clever-client.js';
import { isSyncAddon, SYNC_CREATE_COMMAND, SyncStore } from '../core/sync/sync-store.js';
import { APP_RELEASE_URL, APP_VERSION, CLI_VERSION, IS_SNAPSHOT } from '../core/constants.js';
import { docsUrl } from '../core/docs.js';
import { markEnvChanged } from '../core/env-pending.js';
import { deploymentLogsHash } from '../core/logs/deployment-logs.js';
import { getLocale, LOCALES, setLocale, t, type Locale } from '../core/i18n.js';
import { getTheme, setTheme, THEME_EVENT, THEMES, type ThemeId } from '../core/themes.js';
import { AddonStore } from '../core/home/addon-store.js';
import { CostStore } from '../core/home/cost-store.js';
import { HomeStore } from '../core/home/home-store.js';
import { eraseLocalData } from '../core/local-data.js';
import { recordVisit } from '../core/home/recents.js';
import type { PaletteCommand } from '../core/palette.js';
import {
  navigate,
  readHashParams,
  readListView,
  routeOwner,
  routeToHash,
  watchRoute,
  type AppTab,
  type Route,
} from '../core/router.js';
import { Session } from '../core/session.js';
import { Vault, type StoredProfile } from '../core/vault/vault.js';
import type { Application } from '../data/api.js';
import './cvc-action-dialog.js';
import './cvc-app-page.js';
import type { DeploymentEndedDetail } from './app/cvc-app-logs.js';
import { APP_TAB_LABELS } from './cvc-app-page.js';
import './cvc-command-palette.js';
import type { CvcCommandPalette } from './cvc-command-palette.js';
import './cvc-login.js';
import './cvc-addon-page.js';
import './cvc-logs-page.js';
import './cvc-orga-page.js';
import './cvc-toaster.js';
import type { CvcToaster, Toast } from './cvc-toaster.js';
import './cvc-unlock.js';
import { appMark, channelBadge } from './shared/brand.js';
import './shared/cvc-cli.js';
import type { OpenActionDetail } from './shared/events.js';
import { formatRelative } from './shared/format.js';
import { sharedStyles } from './shared/styles.js';

type Phase = 'loading' | 'login' | 'adding' | 'unlock' | 'workspace';

interface PendingAction {
  action: ActionDefinition;
  prefill: ActionValues;
}

const LAST_OWNER_KEY = 'cvc.lastOwnerId';
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

/** Application shell: vault and session lifecycle, routing, top bar, command palette and action dialog. */
@customElement('cvc-app')
export class CvcApp extends CvcElement {
  @state() private phase: Phase = 'loading';
  @state() private route: Route = { kind: 'home' };
  @state() private session: Session | null = null;
  @state() private currentApp: Application | null = null;
  @state() private pendingAction: PendingAction | null = null;
  @state() private revision = 0;
  /** "Erase everything from this browser" asks first (#17). */
  @state() private confirmErase = false;
  /** Whether the accounts removed at this load (#14) were reported, on the sign-in page or by a toast (#20). */
  private retiredReported = false;
  /** The latest clever-tools release on npm, null while unknown. */
  @state() private latestCli: string | null = null;

  @query('cvc-command-palette') private palette?: CvcCommandPalette;
  @query('cvc-toaster') private toaster?: CvcToaster;
  @query('details.menu') private menu?: HTMLDetailsElement;

  private readonly homeStore = new HomeStore();
  private readonly costStore = new CostStore();
  private readonly addonStore = new AddonStore();
  /** The sync of the views through the personal space's configuration provider (#1). */
  private readonly syncStore = new SyncStore();
  private unwatchRoute?: () => void;
  private readonly onChange = () => this.requestUpdate();
  private readonly onSessionChange = () => {
    this.attachSync();
    this.requestUpdate();
  };
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.menu?.open) {
      // Handled here so the page under the menu keeps its selection.
      event.preventDefault();
      this.closeMenu(true);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.phase === 'workspace' && this.pendingAction == null) {
        this.palette?.toggle();
      }
    }
  };
  private readonly onOpenAction = (event: CustomEvent<OpenActionDetail>) => {
    this.openAction(event.detail.actionId, event.detail.prefill);
  };
  private readonly onToast = (event: CustomEvent<Toast>) => {
    this.toaster?.push(event.detail);
  };
  private readonly onRefreshSummary = () => {
    void this.session?.refreshSummary();
  };
  /** A deployment followed in the logs ended: the states and last deployments of the organisation move. */
  private readonly onDeploymentEnded = (event: Event) => {
    const { ownerId } = (event as CustomEvent<DeploymentEndedDetail>).detail;
    const session = this.session;
    const client = session?.client;
    const orga = session?.findOrganisation(ownerId);
    void session?.refreshSummary();
    if (client != null && orga != null) {
      void this.homeStore.refresh(
        client,
        ownerId,
        orga.applications.map((app) => app.id),
        { force: true },
      );
    }
  };
  /** A click anywhere but in the account menu closes it. */
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.menu?.open && !event.composedPath().includes(this.menu)) {
      this.closeMenu(false);
    }
  };

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointerdown', this.onPointerDown);
    this.addEventListener('cvc-open-action', this.onOpenAction);
    this.addEventListener('cvc-toast', this.onToast);
    this.addEventListener('cvc-refresh-summary', this.onRefreshSummary);
    this.addEventListener('cvc-deployment-ended', this.onDeploymentEnded);
    window.addEventListener(THEME_EVENT, this.onChange);
    this.unwatchRoute = watchRoute((route) => {
      this.route = route;
      this.confirmErase = false;
      const owner = routeOwner(route);
      if (owner != null) {
        rememberOwner(owner);
      }
      if (route.kind === 'app') {
        recordVisit(route.ownerId, route.appId);
      }
      if (route.kind !== 'app') {
        this.pendingAction = null;
      }
    });
    void this.boot();
    void latestRelease().then((version) => (this.latestCli = version));
  }

  override disconnectedCallback(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerdown', this.onPointerDown);
    this.removeEventListener('cvc-open-action', this.onOpenAction);
    this.removeEventListener('cvc-toast', this.onToast);
    this.removeEventListener('cvc-refresh-summary', this.onRefreshSummary);
    this.removeEventListener('cvc-deployment-ended', this.onDeploymentEnded);
    window.removeEventListener(THEME_EVENT, this.onChange);
    this.unwatchRoute?.();
    this.session?.removeEventListener('change', this.onSessionChange);
    this.session?.vault.removeEventListener('change', this.onChange);
    this.syncStore.removeEventListener('change', this.onChange);
    this.syncStore.removeEventListener('created', this.onSyncCreated);
    super.disconnectedCallback();
  }

  override willUpdate(_changed: PropertyValues<this>): void {
    // Home is a redirect to the last visited organisation once the summary is known.
    if (this.phase === 'workspace' && this.route.kind === 'home' && this.session?.summary != null) {
      const orgas = this.session.organisations;
      const remembered = readOwner();
      const target =
        orgas.find((orga) => orga.id === remembered) ??
        orgas.find((orga) => !orga.isPersonal && orga.applications.length > 0) ??
        orgas[0];
      if (target != null) {
        navigate({ kind: 'orga', ownerId: target.id });
      }
    }
  }

  // --- lifecycle ---------------------------------------------------------

  private async boot(): Promise<void> {
    const vault = await Vault.load();
    const session = new Session(vault);
    session.addEventListener('change', this.onSessionChange);
    vault.addEventListener('change', this.onChange);
    this.syncStore.addEventListener('change', this.onChange);
    this.syncStore.addEventListener('created', this.onSyncCreated);
    this.session = session;
    await this.syncPhase();
  }

  /** Derives the phase from the vault, activating the stored profile when needed. */
  private async syncPhase(): Promise<void> {
    const session = this.session;
    if (session == null) {
      return;
    }
    const vault = session.vault;
    if (vault.state === 'locked') {
      this.phase = 'unlock';
      return;
    }
    const active = vault.activeProfile;
    if (active == null) {
      session.deactivate();
      this.phase = 'login';
      // The sign-in page says it.
      this.retiredReported ||= vault.retired > 0;
      return;
    }
    this.phase = 'workspace';
    if (vault.retired > 0 && !this.retiredReported) {
      // Other accounts are left: say it here, the sign-in page will not show (#20).
      this.retiredReported = true;
      const count = vault.retired;
      void this.updateComplete.then(() =>
        this.toaster?.push({
          kind: 'info',
          message: t('shell.retired', { count }),
          action: { label: t('shell.addAccount'), run: () => (this.phase = 'adding') },
        }),
      );
    }
    if (session.profile?.id !== active.id) {
      this.currentApp = null;
      this.homeStore.forget();
      this.costStore.forget();
      this.addonStore.forget();
      await session.activate(active);
    }
  }

  private closeMenu(refocus: boolean): void {
    if (this.menu == null) {
      return;
    }
    this.menu.open = false;
    if (refocus) {
      this.menu.querySelector('summary')?.focus();
    }
  }

  private lock(): void {
    this.session?.deactivate();
    this.session?.vault.lock();
    void this.syncPhase();
  }

  private async forgetActiveAccount(): Promise<void> {
    const session = this.session;
    const profile = session?.profile;
    if (session == null || profile == null) {
      return;
    }
    session.deactivate();
    clearClientCaches();
    await session.vault.removeProfile(profile.id);
    await this.syncPhase();
  }

  private async switchProfile(profile: StoredProfile): Promise<void> {
    await this.session?.vault.setActiveProfile(profile.id);
    await this.syncPhase();
  }

  /** The new add-on belongs in the personal space's list. */
  private readonly onSyncCreated = () => void this.session?.refreshSummary();

  /** The sync follows the signed-in account: its personal space holds the add-on, when there is one. */
  private attachSync(): void {
    const session = this.session;
    const client = session?.client ?? null;
    if (session == null || client == null) {
      this.syncStore.detach();
      return;
    }
    const personal = session.organisations.find((orga) => orga.id.startsWith('user_'));
    if (session.summary != null && personal != null) {
      this.syncStore.attach(client, personal.id, personal.addons);
    }
  }

  private destroyEverything(): void {
    this.confirmErase = false;
    this.syncStore.detach();
    this.session?.deactivate();
    this.session?.vault.destroy();
    eraseLocalData();
    this.costStore.forget();
    this.addonStore.forget();
    void this.syncPhase();
  }

  // --- actions -----------------------------------------------------------

  private openAction(actionId: string, prefill: ActionValues = {}): void {
    const action = findAction(actionId);
    const route = this.route;
    if (action == null || (route.kind !== 'app' && route.kind !== 'addon')) {
      return;
    }
    const providerId =
      route.kind === 'addon'
        ? this.session?.findOrganisation(route.ownerId)?.addons.find((addon) => addon.id === route.addonId)?.providerId
        : undefined;
    const app = route.kind === 'app' && this.currentApp?.id === route.appId ? this.currentApp : null;
    if (!offersAction(action, route.kind, providerId, app)) {
      return;
    }
    this.palette?.close();
    this.pendingAction = { action, prefill };
  }

  private actionContext(): ActionContext | null {
    const client = this.session?.client;
    const route = this.route;
    if (client == null || (route.kind !== 'app' && route.kind !== 'addon')) {
      return null;
    }
    const orga = this.session?.findOrganisation(route.ownerId) ?? null;
    if (route.kind === 'addon') {
      const addon = orga?.addons.find((candidate) => candidate.id === route.addonId) ?? null;
      return { client, ownerId: route.ownerId, appId: '', app: null, orga, addon };
    }
    const app = this.currentApp?.id === route.appId ? this.currentApp : null;
    return { client, ownerId: route.ownerId, appId: route.appId, app, orga };
  }

  private onActionDone(event: CustomEvent<ActionResult>): void {
    const result = event.detail;
    this.pendingAction = null;
    if (result.envChanged && this.route.kind === 'app') {
      markEnvChanged(this.route.appId);
    }
    const followUp = result.followUp;
    this.toaster?.push({
      kind: 'success',
      message: result.message,
      action: followUp == null ? undefined : { label: followUp.label, run: () => this.openAction(followUp.actionId) },
    });
    if (result.refresh) {
      this.revision += 1;
      void this.session?.refreshSummary();
    }
    if (result.deploymentId != null && this.route.kind === 'app') {
      // The deployment just started, followed in the Logs tab until it ends, as `clever restart` does.
      window.location.hash = deploymentLogsHash(
        this.route.ownerId,
        this.route.appId,
        result.deploymentId,
        readListView(window.location.hash),
      );
    } else if (
      result.cancelledDeploymentId != null &&
      this.route.kind === 'app' &&
      readHashParams().get('deployment') === result.cancelledDeploymentId
    ) {
      // Cancelled from its own logs: they stay, and say how it ended.
    } else if (result.navigateTo != null && this.route.kind === 'app') {
      navigate({ kind: 'app', ownerId: this.route.ownerId, appId: this.route.appId, tab: result.navigateTo });
    } else if (result.addonTab != null && this.route.kind === 'addon') {
      navigate(
        { kind: 'addon', ownerId: this.route.ownerId, addonId: this.route.addonId, tab: result.addonTab },
        result.params,
      );
    }
  }

  // --- palette -----------------------------------------------------------

  private buildCommands(): PaletteCommand[] {
    const session = this.session;
    if (session == null) {
      return [];
    }
    const commands: PaletteCommand[] = [];
    const route = this.route;

    if (route.kind === 'app') {
      const current = session.findApplication(route.appId);
      for (const tab of Object.keys(APP_TAB_LABELS) as AppTab[]) {
        const { label, cli } = APP_TAB_LABELS[tab];
        commands.push({
          id: `tab:${tab}`,
          title: t(label),
          subtitle: current?.app.name,
          group: 'Page',
          cli,
          run: () => navigate({ kind: 'app', ownerId: route.ownerId, appId: route.appId, tab }),
        });
      }
      const loaded = this.currentApp?.id === route.appId ? this.currentApp : null;
      for (const action of ACTIONS.filter((candidate) => offersAction(candidate, 'app', undefined, loaded))) {
        commands.push({
          id: `action:${action.id}`,
          title: t(action.title),
          subtitle: current?.app.name,
          group: 'Actions',
          keywords: action.keywords,
          cli: action.cliHint,
          run: () => this.openAction(action.id),
        });
      }
    } else if (route.kind === 'addon') {
      const addon = session.findOrganisation(route.ownerId)?.addons.find((candidate) => candidate.id === route.addonId);
      if (addon != null) {
        // The sync add-on keeps its name (#26).
        const offered = ACTIONS.filter(
          (candidate) =>
            offersAction(candidate, 'addon', addon.providerId) &&
            !(candidate.id === 'addon-rename' && isSyncAddon(route.ownerId, addon)),
        );
        for (const action of offered) {
          commands.push({
            id: `action:${action.id}`,
            title: t(action.title),
            subtitle: addon.name,
            group: 'Actions',
            keywords: action.keywords,
            cli: action.cliHint,
            run: () => this.openAction(action.id),
          });
        }
      }
    }

    for (const orga of session.organisations) {
      for (const app of orga.applications) {
        if (app.isArchived) {
          continue;
        }
        commands.push({
          id: `app:${app.id}`,
          title: app.name,
          subtitle: `${orga.name} · ${app.variantName}`,
          group: 'Applications',
          keywords: [orga.name, app.variantName, app.id],
          run: () => navigate({ kind: 'app', ownerId: orga.id, appId: app.id, tab: 'overview' }),
        });
      }
    }

    for (const orga of session.organisations) {
      commands.push({
        id: `orga:${orga.id}`,
        title: orga.name,
        subtitle: t('home.counts', { apps: orga.applications.length, addons: orga.addons.length }),
        group: 'Organisations',
        keywords: [orga.id],
        run: () => navigate({ kind: 'orga', ownerId: orga.id }),
      });
    }

    commands.push({
      id: 'session:refresh',
      title: t('palette.refreshData'),
      group: 'Session',
      run: () => void session.refreshSummary(),
    });
    commands.push({
      id: 'session:account',
      title: t('account.accountsInBrowser'),
      subtitle: session.profile?.email,
      group: 'Session',
      cli: 'clever profile list',
      run: () => navigate({ kind: 'account' }),
    });
    for (const profile of session.vault.profiles) {
      if (profile.id !== session.profile?.id) {
        commands.push({
          id: `session:switch:${profile.id}`,
          title: t('palette.switchAccount', { name: profile.name ?? profile.email }),
          subtitle: profile.email,
          group: 'Session',
          cli: 'clever profile switch',
          run: () => void this.switchProfile(profile),
        });
      }
    }
    commands.push({
      id: 'session:docs',
      title: t('docs.menu'),
      subtitle: t('docs.open'),
      group: 'Session',
      keywords: ['documentation', 'help', 'aide', 'doc'],
      run: () => void window.open(docsUrl(), '_blank', 'noopener'),
    });
    commands.push({
      id: 'session:add',
      title: t('shell.addAccount'),
      group: 'Session',
      // Adding an account here means creating an API token for it: `clever login` is the OAuth flow (#14, #18).
      cli: 'clever tokens create clever-visual-cli',
      run: () => (this.phase = 'adding'),
    });
    for (const locale of LOCALES) {
      if (locale.id !== getLocale()) {
        commands.push({
          id: `session:lang:${locale.id}`,
          title: t('palette.language', { name: locale.label }),
          group: 'Session',
          keywords: ['lang', 'langue', 'language', locale.id],
          run: () => setLocale(locale.id),
        });
      }
    }
    for (const theme of THEMES) {
      if (theme.id !== getTheme()) {
        commands.push({
          id: `session:theme:${theme.id}`,
          title: t('palette.theme', { name: t(theme.label) }),
          group: 'Session',
          keywords: ['theme', 'thème', 'apparence', 'appearance', theme.id],
          run: () => setTheme(theme.id),
        });
      }
    }
    if (session.vault.mode === 'encrypted') {
      commands.push({
        id: 'session:lock',
        title: t('palette.lockVault'),
        group: 'Session',
        run: () => this.lock(),
      });
    }
    commands.push({
      id: 'session:logout',
      title: t('shell.logout'),
      subtitle: t('palette.logoutSubtitle'),
      group: 'Session',
      cli: 'clever logout',
      run: () => void this.forgetActiveAccount(),
    });
    return commands;
  }

  // --- rendering ---------------------------------------------------------

  override render() {
    const session = this.session;
    if (session == null || this.phase === 'loading') {
      return html`<p class="empty">${t('common.loading')}</p>`;
    }
    switch (this.phase) {
      case 'login':
        return html`<cvc-login .session=${session} @cvc-logged-in=${this.syncPhase}></cvc-login>`;
      case 'adding':
        return html`<cvc-login
          .session=${session}
          adding
          @cvc-logged-in=${this.syncPhase}
          @cvc-cancel=${() => (this.phase = 'workspace')}
        ></cvc-login>`;
      case 'unlock':
        return html`<cvc-unlock
          .vault=${session.vault}
          @cvc-unlocked=${this.syncPhase}
          @cvc-vault-forgotten=${this.syncPhase}
        ></cvc-unlock>`;
      case 'workspace':
        return this.renderWorkspace(session);
    }
  }

  private renderWorkspace(session: Session) {
    const profile = session.profile;
    const currentOwnerId = routeOwner(this.route) ?? '';
    const actionContext = this.pendingAction != null ? this.actionContext() : null;
    return html`
      <header class="topbar">
        <a class="brand" href="#/">${appMark(18)}clever-visual-cli${channelBadge()}</a>
        ${
          session.summary != null
            ? html`<select
                aria-label="Organisation"
                .value=${currentOwnerId}
                @change=${(event: Event) =>
                  navigate({ kind: 'orga', ownerId: (event.currentTarget as HTMLSelectElement).value })}
              >
                ${currentOwnerId === '' ? html`<option value="">${t('shell.orgaPlaceholder')}</option>` : nothing}
                ${session.organisations.map(
                  (orga) =>
                    html`<option value=${orga.id} ?selected=${orga.id === currentOwnerId}>${orga.name}</option>`,
                )}
              </select>`
            : nothing
        }
        <button type="button" class="search" @click=${() => this.palette?.open()}>
          <span>${t('shell.search')}</span>
          <kbd>${IS_MAC ? '⌘K' : 'Ctrl+K'}</kbd>
        </button>
        <details class="menu">
          <summary title=${profile?.email ?? ''}>
            <span class="identity">
              <span class="who">${profile?.name ?? profile?.email ?? t('shell.account')}</span>
              ${profile?.name != null && profile.email ? html`<span class="email">${profile.email}</span>` : nothing}
            </span>
            ${
              isNewerRelease(this.latestCli)
                ? html`<span
                    class="cli-dot"
                    title=${t('cli.newer', { latest: this.latestCli ?? '', current: CLI_VERSION })}
                    ><span class="sr-only"
                      >${t('cli.newer', { latest: this.latestCli ?? '', current: CLI_VERSION })}</span
                    ></span
                  >`
                : nothing
            }
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
          </summary>
          <div class="menu-items">
            <label class="lang">
              ${t('common.language')}
              <select
                aria-label=${t('common.language')}
                @change=${(event: Event) => setLocale((event.currentTarget as HTMLSelectElement).value as Locale)}
              >
                ${LOCALES.map(
                  (locale) =>
                    html`<option value=${locale.id} ?selected=${locale.id === getLocale()}>${locale.label}</option>`,
                )}
              </select>
            </label>
            <label class="lang">
              ${t('theme.label')}
              <select
                aria-label=${t('theme.label')}
                @change=${(event: Event) => setTheme((event.currentTarget as HTMLSelectElement).value as ThemeId)}
              >
                ${THEMES.map(
                  (theme) =>
                    html`<option value=${theme.id} ?selected=${theme.id === getTheme()}>${t(theme.label)}</option>`,
                )}
              </select>
            </label>
            <hr />
            <a class="item" href=${routeToHash({ kind: 'account' })} @click=${() => this.closeMenu(false)}
              >${t('account.accountsInBrowser')}</a
            >
            <a class="item" href=${docsUrl()} target="_blank" rel="noopener" @click=${() => this.closeMenu(false)}
              >${t('docs.menu')} ↗</a
            >
            ${
              session.vault.mode === 'encrypted'
                ? html`<button type="button" class="item" @click=${this.lock}>${t('shell.lock')}</button>`
                : nothing
            }
            <button
              type="button"
              class="item"
              @click=${() => {
                this.closeMenu(false);
                void this.forgetActiveAccount();
              }}
            >
              ${t('shell.logout')}
            </button>
            <hr />
            <p class="app-release muted">
              ${t('app.version', { version: APP_VERSION })} ·
              <a href=${APP_RELEASE_URL} target="_blank" rel="noopener noreferrer"
                >${IS_SNAPSHOT ? t('app.commit') : t('cli.notes')} ↗</a
              >
            </p>
            ${this.renderCliRelease()}
          </div>
        </details>
      </header>
      <main>${this.renderContent(session)}</main>
      <cvc-command-palette .commands=${this.buildCommands()}></cvc-command-palette>
      ${
        this.pendingAction != null && actionContext != null
          ? html`<cvc-action-dialog
              .action=${this.pendingAction.action}
              .context=${actionContext}
              .prefill=${this.pendingAction.prefill}
              @cvc-action-done=${this.onActionDone}
              @cvc-action-close=${() => (this.pendingAction = null)}
            ></cvc-action-dialog>`
          : nothing
      }
      <cvc-toaster></cvc-toaster>
    `;
  }

  private renderContent(session: Session) {
    if (this.route.kind === 'account') {
      return this.renderAccount(session);
    }
    if (session.summaryError != null) {
      return html`<div class="stack">
        <p class="error" role="alert">${session.summaryError}</p>
        <div><button type="button" @click=${() => session.refreshSummary()}>${t('common.retry')}</button></div>
      </div>`;
    }
    if (session.summary == null) {
      return html`<p class="empty">${t('shell.loadingOrgas')}</p>`;
    }
    switch (this.route.kind) {
      case 'orga': {
        const orga = session.findOrganisation(this.route.ownerId);
        const client = session.client;
        if (orga == null || client == null) {
          return html`<p class="empty">${t('shell.unknownOrga')}</p>`;
        }
        return html`<cvc-orga-page
          .orga=${orga}
          .client=${client}
          .store=${this.homeStore}
          .costStore=${this.costStore}
          .addonStore=${this.addonStore}
          .syncStore=${this.syncStore}
          userId=${session.profile?.userId ?? ''}
          .revision=${this.revision}
        ></cvc-orga-page>`;
      }
      case 'addon': {
        const orga = session.findOrganisation(this.route.ownerId);
        const client = session.client;
        if (orga == null || client == null) {
          return html`<p class="empty">${t('shell.unknownOrga')}</p>`;
        }
        return html`<cvc-addon-page
          .client=${client}
          .orga=${orga}
          addonId=${this.route.addonId}
          tab=${this.route.tab}
          .store=${this.homeStore}
          .costStore=${this.costStore}
          .addonStore=${this.addonStore}
          .revision=${this.revision}
        ></cvc-addon-page>`;
      }
      case 'logs': {
        const orga = session.findOrganisation(this.route.ownerId);
        const client = session.client;
        if (orga == null || client == null) {
          return html`<p class="empty">${t('shell.unknownOrga')}</p>`;
        }
        return html`<cvc-logs-page .orga=${orga} .client=${client} .store=${this.homeStore}></cvc-logs-page>`;
      }
      case 'app': {
        const client = session.client;
        if (client == null) {
          return nothing;
        }
        const found = session.findApplication(this.route.appId);
        return html`<cvc-app-page
          .client=${client}
          ownerId=${this.route.ownerId}
          appId=${this.route.appId}
          tab=${this.route.tab}
          deploymentId=${this.route.tab === 'logs' ? (readHashParams().get('deployment') ?? '') : ''}
          .summaryApp=${found?.app ?? null}
          .revision=${this.revision}
          .orga=${session.findOrganisation(this.route.ownerId)}
          .store=${this.homeStore}
          .costStore=${this.costStore}
          .addonStore=${this.addonStore}
          @cvc-app-loaded=${(event: CustomEvent<Application>) => (this.currentApp = event.detail)}
        ></cvc-app-page>`;
      }
      default:
        return html`<p class="empty">${t('common.loading')}</p>`;
    }
  }

  /**
   * The clever-tools release the commands are checked against, and a warning
   * with the release notes when npm has a newer one.
   */
  private renderCliRelease() {
    const latest = this.latestCli;
    if (latest == null || !isNewerRelease(latest)) {
      return html`<p class="cli-release muted">${t('cli.checked', { version: CLI_VERSION })}</p>`;
    }
    return html`<p class="cli-release warn">
      ${t('cli.newer', { latest, current: CLI_VERSION })}
      <a href=${releaseNotesUrl(latest)} target="_blank" rel="noopener noreferrer">${t('cli.notes')} ↗</a>
    </p>`;
  }

  /**
   * The sync of the views and display preferences: enabled here as well as
   * from the views menu, even after "Not now"; the add-on, once there, is
   * linked to, since deleting it is how the sync stops.
   */
  private renderSync() {
    const sync = this.syncStore;
    if (sync.state === 'idle') {
      return nothing;
    }
    const addon = sync.addon;
    return html`<section class="card stack">
      <h2>${t('sync.title')}</h2>
      ${
        sync.state === 'on' && addon != null
          ? html`<p class="small">
                ${
                  sync.busy
                    ? t('sync.syncing')
                    : sync.lastSyncAt != null
                      ? html`${t('sync.on')} · ${t('sync.lastSync', { when: formatRelative(sync.lastSyncAt) })}`
                      : t('sync.on')
                }
              </p>
              <p class="muted small">
                ${t('sync.accountOn')}
                <a href=${routeToHash({ kind: 'addon', ownerId: sync.ownerId, addonId: addon.id, tab: 'overview' })}
                  >${t('sync.openAddon')}</a
                >
              </p>
              <div class="row">
                <button type="button" ?disabled=${sync.busy} @click=${() => sync.syncNow()}>${t('sync.now')}</button>
              </div>`
          : html`${sync.lost ? html`<p class="notice small" role="status">${t('sync.lost')}</p>` : nothing}
              <p class="muted small">${t('sync.accountOff')}</p>
              <cvc-cli block command=${SYNC_CREATE_COMMAND}></cvc-cli>
              <div class="row">
                <button
                  type="button"
                  class="primary"
                  ?disabled=${sync.state === 'enabling'}
                  @click=${() => sync.enable()}
                >
                  ${sync.state === 'enabling' ? t('sync.enabling') : t('sync.enable')}
                </button>
              </div>`
      }
      ${sync.error != null ? html`<p class="error small" role="alert">${t(sync.state === 'on' ? 'sync.failed' : 'sync.createFailed', { error: sync.error })}</p>` : nothing}
    </section>`;
  }

  private renderAccount(session: Session) {
    const vault = session.vault;
    return html`
      <div class="account stack">
        <h1>${t('account.accountsInBrowser')}</h1>
        <section class="card stack">
          <p class="muted small">
            ${vault.mode === 'encrypted' ? t('account.encryptedNote') : t('account.sessionNote')}
          </p>
          <ul class="profiles">
            ${vault.profiles.map(
              (profile) =>
                html`<li class="row">
                  <span>
                    <strong>${profile.name ?? profile.email}</strong>
                    <span class="muted small">${profile.email} · ${t('account.apiToken')}</span>
                  </span>
                  ${
                    profile.id === session.profile?.id
                      ? html`<span class="badge ok">${t('account.active')}</span>`
                      : html`<button type="button" class="ghost" @click=${() => this.switchProfile(profile)}>
                          ${t('account.use')}
                        </button>`
                  }
                </li>`,
            )}
          </ul>
          <div class="row">
            <button type="button" @click=${() => (this.phase = 'adding')}>${t('shell.addAccount')}</button>
            ${vault.mode === 'encrypted' ? html`<button type="button" @click=${this.lock}>${t('shell.lock')}</button>` : nothing}
            <button type="button" @click=${this.forgetActiveAccount}>${t('shell.logout')}</button>
            <button
              type="button"
              class="ghost danger"
              aria-expanded=${this.confirmErase ? 'true' : 'false'}
              @click=${() => (this.confirmErase = true)}
            >
              ${t('account.eraseAll')}
            </button>
          </div>
          ${
            this.confirmErase
              ? html`<div class="erase-confirm stack" role="alert">
                  <p class="small">${t('account.eraseWarning', { count: vault.profiles.length })}</p>
                  <div class="row">
                    <button type="button" class="danger-solid" @click=${this.destroyEverything}>
                      ${t('account.eraseConfirm')}
                    </button>
                    <button type="button" class="ghost" @click=${() => (this.confirmErase = false)}>
                      ${t('common.cancel')}
                    </button>
                  </div>
                </div>`
              : nothing
          }
        </section>
        ${this.renderSync()}
        <section class="card stack">
          <h2>${t('common.language')}</h2>
          <div class="row">
            ${LOCALES.map(
              (locale) =>
                html`<button
                  type="button"
                  class=${locale.id === getLocale() ? 'primary' : 'ghost'}
                  aria-pressed=${locale.id === getLocale()}
                  @click=${() => setLocale(locale.id)}
                >
                  ${locale.label}
                </button>`,
            )}
          </div>
        </section>
        <section class="card stack">
          <h2>${t('theme.label')}</h2>
          <div class="row">
            ${THEMES.map(
              (theme) =>
                html`<button
                  type="button"
                  class=${theme.id === getTheme() ? 'primary' : 'ghost'}
                  aria-pressed=${theme.id === getTheme()}
                  @click=${() => setTheme(theme.id)}
                >
                  ${t(theme.label)}
                </button>`,
            )}
          </div>
          <p class="muted small">${t('theme.hint')}</p>
        </section>
      </div>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      .topbar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 1rem;
        border-bottom: 1px solid var(--cvc-border);
        background: var(--cvc-surface);
        flex: none;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        text-decoration: none;
      }
      .search {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex: 1 1 280px;
        max-width: 480px;
        color: var(--cvc-muted);
        background: var(--cvc-bg);
      }
      .search kbd {
        font-family: inherit;
        font-size: 0.75rem;
        border: 1px solid var(--cvc-border);
        border-radius: 4px;
        padding: 0 0.3rem;
      }
      .menu {
        margin-left: auto;
        position: relative;
      }
      /* A menu button like the selection menus of the home page: name and e-mail (two accounts
         of one person often share the name), then a caret that turns when the menu is open. */
      .menu summary {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        max-width: 280px;
        cursor: pointer;
        list-style: none;
        padding: 0.25rem 0.6rem 0.25rem 0.7rem;
        line-height: 1.25;
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
      }
      .menu summary:hover,
      .menu[open] summary {
        border-color: var(--cvc-accent);
      }
      .menu summary::-webkit-details-marker {
        display: none;
      }
      .menu .identity {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .menu .who,
      .menu .email {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .menu .email {
        font-size: 0.75rem;
        color: var(--cvc-muted);
      }
      .menu .caret {
        flex: none;
        opacity: 0.7;
        transition: transform 0.15s;
      }
      .menu[open] .caret {
        transform: rotate(180deg);
      }
      .menu-items {
        position: absolute;
        right: 0;
        top: calc(100% + 0.3rem);
        min-width: 220px;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.3rem;
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
        box-shadow: var(--cvc-shadow-pop);
        z-index: 10;
      }
      .menu-items .item {
        display: block;
        padding: 0.35rem 0.6rem;
        font: inherit;
        font-size: 0.88rem;
        text-align: left;
        text-decoration: none;
        color: var(--cvc-text);
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }
      .menu-items .item:hover,
      .menu-items .item:focus-visible {
        outline: none;
        background: color-mix(in srgb, var(--cvc-accent) 10%, transparent);
      }
      .menu-items .lang {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.2rem 0.3rem 0.2rem 0.6rem;
        font-size: 0.88rem;
        color: var(--cvc-muted);
      }
      .menu-items hr {
        width: 100%;
        margin: 0.2rem 0;
        border: none;
        border-top: 1px solid var(--cvc-border);
      }
      .menu-items .app-release,
      .menu-items .cli-release {
        margin: 0;
        padding: 0.3rem 0.6rem 0.35rem;
        font-size: 0.8rem;
        line-height: 1.35;
      }
      .menu-items .app-release a {
        white-space: nowrap;
      }
      .menu-items .cli-release.warn {
        border-left: 3px solid var(--cvc-warn);
        background: color-mix(in srgb, var(--cvc-warn) 8%, transparent);
        border-radius: 6px;
      }
      .cli-dot {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--cvc-warn);
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      main {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 0 1.5rem 1.25rem;
        display: flex;
        flex-direction: column;
      }
      /* The top padding sits on the page rather than on the scroll area, so a page's sticky
         elements stick at the very top of it. */
      main > * {
        flex: 1;
        min-height: 0;
        padding-top: 1.25rem;
      }
      .account {
        max-width: 720px;
        flex: none;
      }
      .profiles {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .profiles li {
        justify-content: space-between;
      }
      /* The name and e-mail block; the badge next to it is a span too. */
      .profiles li > span:first-child {
        display: flex;
        flex-direction: column;
      }
      .profiles .badge,
      .profiles button {
        flex: none;
      }
      button.danger {
        color: var(--cvc-danger);
        border-color: var(--cvc-danger);
      }
      .notice {
        padding: 0.6rem 0.8rem;
        border: 1px solid color-mix(in srgb, var(--cvc-info) 40%, var(--cvc-border));
        border-radius: var(--cvc-radius);
        background: color-mix(in srgb, var(--cvc-info) 8%, transparent);
      }
      .erase-confirm {
        gap: 0.6rem;
        padding: 0.75rem 0.9rem;
        border: 1px solid var(--cvc-danger);
        border-radius: var(--cvc-radius);
        background: color-mix(in srgb, var(--cvc-danger) 6%, transparent);
      }
      button.danger-solid {
        background: var(--cvc-danger);
        color: var(--cvc-accent-text);
        border-color: transparent;
      }
      @media (max-width: 720px) {
        main {
          padding: 1rem;
        }
        .topbar {
          flex-wrap: wrap;
        }
      }
    `,
  ];
}

function rememberOwner(ownerId: string): void {
  try {
    localStorage.setItem(LAST_OWNER_KEY, ownerId);
  } catch {
    // Not essential.
  }
}

function readOwner(): string | null {
  try {
    return localStorage.getItem(LAST_OWNER_KEY);
  } catch {
    return null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app': CvcApp;
  }
}
