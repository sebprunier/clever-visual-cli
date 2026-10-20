import { css, html, nothing, type PropertyValues } from 'lit';
import { CvcElement } from './shared/cvc-element.js';
import { customElement, query, state } from 'lit/decorators.js';
import {
  ACTIONS,
  findAction,
  type ActionContext,
  type ActionDefinition,
  type ActionResult,
  type ActionValues,
} from '../core/actions.js';
import { clearClientCaches } from '../core/clever-client.js';
import { getLocale, LOCALES, setLocale, t, type Locale } from '../core/i18n.js';
import { clearCostStorage, CostStore } from '../core/home/cost-store.js';
import { clearHomeStorage, HomeStore } from '../core/home/home-store.js';
import { recordVisit } from '../core/home/recents.js';
import type { PaletteCommand } from '../core/palette.js';
import { navigate, routeToHash, watchRoute, type AppTab, type Route } from '../core/router.js';
import { Session } from '../core/session.js';
import { Vault, type StoredProfile } from '../core/vault/vault.js';
import type { Application } from '../data/api.js';
import './cvc-action-dialog.js';
import './cvc-app-page.js';
import { APP_TAB_LABELS } from './cvc-app-page.js';
import './cvc-command-palette.js';
import type { CvcCommandPalette } from './cvc-command-palette.js';
import './cvc-login.js';
import './cvc-orga-page.js';
import './cvc-toaster.js';
import type { CvcToaster, Toast } from './cvc-toaster.js';
import './cvc-unlock.js';
import type { OpenActionDetail } from './shared/events.js';
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

  @query('cvc-command-palette') private palette?: CvcCommandPalette;
  @query('cvc-toaster') private toaster?: CvcToaster;
  @query('details.menu') private menu?: HTMLDetailsElement;

  private readonly homeStore = new HomeStore();
  private readonly costStore = new CostStore();
  private unwatchRoute?: () => void;
  private readonly onChange = () => this.requestUpdate();
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
    this.unwatchRoute = watchRoute((route) => {
      this.route = route;
      if (route.kind === 'orga' || route.kind === 'app') {
        rememberOwner(route.ownerId);
      }
      if (route.kind === 'app') {
        recordVisit(route.ownerId, route.appId);
      }
      if (route.kind !== 'app') {
        this.pendingAction = null;
      }
    });
    void this.boot();
  }

  override disconnectedCallback(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerdown', this.onPointerDown);
    this.removeEventListener('cvc-open-action', this.onOpenAction);
    this.removeEventListener('cvc-toast', this.onToast);
    this.removeEventListener('cvc-refresh-summary', this.onRefreshSummary);
    this.unwatchRoute?.();
    this.session?.removeEventListener('change', this.onChange);
    this.session?.vault.removeEventListener('change', this.onChange);
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
    session.addEventListener('change', this.onChange);
    vault.addEventListener('change', this.onChange);
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
      return;
    }
    this.phase = 'workspace';
    if (session.profile?.id !== active.id) {
      this.currentApp = null;
      this.homeStore.forget();
      this.costStore.forget();
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

  private destroyEverything(): void {
    this.session?.deactivate();
    this.session?.vault.destroy();
    clearClientCaches();
    clearHomeStorage();
    clearCostStorage();
    this.costStore.forget();
    void this.syncPhase();
  }

  // --- actions -----------------------------------------------------------

  private openAction(actionId: string, prefill: ActionValues = {}): void {
    const action = findAction(actionId);
    if (action == null || this.route.kind !== 'app') {
      return;
    }
    this.palette?.close();
    this.pendingAction = { action, prefill };
  }

  private actionContext(): ActionContext | null {
    const client = this.session?.client;
    if (client == null || this.route.kind !== 'app') {
      return null;
    }
    const app = this.currentApp?.id === this.route.appId ? this.currentApp : null;
    return { client, ownerId: this.route.ownerId, appId: this.route.appId, app };
  }

  private onActionDone(event: CustomEvent<ActionResult>): void {
    const result = event.detail;
    this.pendingAction = null;
    this.toaster?.push({ kind: 'success', message: result.message });
    if (result.refresh) {
      this.revision += 1;
      void this.session?.refreshSummary();
    }
    if (result.navigateTo != null && this.route.kind === 'app') {
      navigate({ kind: 'app', ownerId: this.route.ownerId, appId: this.route.appId, tab: result.navigateTo });
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
      for (const action of ACTIONS) {
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
      id: 'session:add',
      title: t('shell.addAccount'),
      group: 'Session',
      cli: 'clever login --alias',
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
    const currentOwnerId = this.route.kind === 'orga' || this.route.kind === 'app' ? this.route.ownerId : '';
    const actionContext = this.pendingAction != null ? this.actionContext() : null;
    return html`
      <header class="topbar">
        <a class="brand" href="#/">clever-visual-cli</a>
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
          <summary>${profile?.name ?? profile?.email ?? t('shell.account')}</summary>
          <div class="menu-items">
            <span class="muted small">${profile?.email}</span>
            <a href=${routeToHash({ kind: 'account' })} @click=${() => this.closeMenu(false)}
              >${t('account.accountsInBrowser')}</a
            >
            <label class="row small lang">
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
            <hr />
            ${
              session.vault.mode === 'encrypted'
                ? html`<button type="button" class="link" @click=${this.lock}>${t('shell.lock')}</button>`
                : nothing
            }
            <button
              type="button"
              class="link"
              @click=${() => {
                this.closeMenu(false);
                void this.forgetActiveAccount();
              }}
            >
              ${t('shell.logout')}
            </button>
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
          userId=${session.profile?.userId ?? ''}
          .revision=${this.revision}
        ></cvc-orga-page>`;
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
          .summaryApp=${found?.app ?? null}
          .revision=${this.revision}
          .orga=${session.findOrganisation(this.route.ownerId)}
          .store=${this.homeStore}
          .costStore=${this.costStore}
          @cvc-app-loaded=${(event: CustomEvent<Application>) => (this.currentApp = event.detail)}
        ></cvc-app-page>`;
      }
      default:
        return html`<p class="empty">${t('common.loading')}</p>`;
    }
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
                    <span class="muted small"
                      >${profile.email} ·
                      ${profile.credentials.type === 'api-token' ? t('account.apiToken') : 'OAuth'}</span
                    >
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
            <button type="button" class="ghost danger" @click=${this.destroyEverything}>
              ${t('account.eraseAll')}
            </button>
          </div>
        </section>
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
      .menu summary {
        cursor: pointer;
        list-style: none;
        padding: 0.45rem 0.7rem;
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
      }
      .menu summary::-webkit-details-marker {
        display: none;
      }
      .menu-items {
        position: absolute;
        right: 0;
        top: calc(100% + 0.3rem);
        min-width: 220px;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem 0.9rem;
        background: var(--cvc-surface);
        border: 1px solid var(--cvc-border);
        border-radius: var(--cvc-radius);
        box-shadow: 0 10px 30px rgb(0 0 0 / 20%);
        z-index: 10;
      }
      .menu-items a,
      .menu-items button.link {
        text-align: left;
        text-decoration: none;
        color: var(--cvc-text);
      }
      .menu-items hr {
        width: 100%;
        margin: 0.1rem 0;
        border: none;
        border-top: 1px solid var(--cvc-border);
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
