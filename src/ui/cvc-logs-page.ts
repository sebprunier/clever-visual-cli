import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { indexActivity, type AppActivity } from '../core/home/activity.js';
import type { HomeStore } from '../core/home/home-store.js';
import { appStatus } from '../core/home/status.js';
import { t, type MessageKey } from '../core/i18n.js';
import { distinctHues, hueColor, hueTint, mergeLines, type MergedLine } from '../core/logs/merge.js';
import { LogStream } from '../core/logs/stream.js';
import { keepListView, readHashParams, routeToHash, writeHashParams, type Route } from '../core/router.js';
import {
  openRuntimeLogs,
  type ApplicationRuntimeLog,
  type ApplicationSummary,
  type Deployment,
  type OrganisationSummary,
} from '../data/api.js';
import './shared/cvc-cli.js';
import { CvcElement } from './shared/cvc-element.js';
import { formatTime } from './shared/format.js';
import { ICON_REFRESH } from './shared/icons.js';
import { inlineStyle } from './shared/inline-style.js';
import {
  logStyles,
  renderRuntimeLine,
  runtimeSearchText,
  SINCE_OPTIONS,
  sinceFlag,
  sinceMinutes,
  streamError,
  streamStatusLabel,
} from './shared/logs.js';
import { statusIcon, statusMessage } from './shared/status.js';
import { sharedStyles } from './shared/styles.js';

type Layout = '1' | '2' | '3' | 'merged';

/** Streams opened at once; beyond, the page says which applications it leaves out. */
const MAX_APPS = 12;
/** Lines the merged view keeps, all applications together. */
const MAX_MERGED = 4000;
const LAYOUT_KEY = 'cvc.logs.layout';
const LAYOUTS: ReadonlyArray<{ value: Layout; label: MessageKey }> = [
  { value: '1', label: 'multilogs.layout.1' },
  { value: '2', label: 'multilogs.layout.2' },
  { value: '3', label: 'multilogs.layout.3' },
  { value: 'merged', label: 'multilogs.layout.merged' },
];

/**
 * The logs of a set of applications (`?apps=` in the URL), built from the home
 * page's selection: side by side in one to three columns, each panel with its
 * own pause, filter and close, or merged into one feed interleaved by date
 * with the application's name in its colour. The toolbar sets the replay
 * window, a filter and the pause for all of them.
 */
@customElement('cvc-logs-page')
export class CvcLogsPage extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property({ attribute: false }) orga!: OrganisationSummary;
  @property({ attribute: false }) store: HomeStore | null = null;

  @state() private apps: ApplicationSummary[] = [];
  /** Applications asked for beyond the cap. */
  @state() private overflow = 0;
  @state() private layout: Layout = readLayout();
  @state() private since = '15m';
  @state() private filter = '';
  @state() private panelFilters: ReadonlyMap<string, string> = new Map();
  @state() private hiddenApps: ReadonlySet<string> = new Set();
  @state() private autoscroll = true;

  #streams = new Map<string, LogStream<ApplicationRuntimeLog>>();
  #merged: { key: string; lines: MergedLine<ApplicationRuntimeLog>[] } = { key: '', lines: [] };
  #activitySource: readonly Deployment[] | null = null;
  #activity: Map<string, AppActivity> = new Map();

  private readonly onChange = () => this.requestUpdate();

  override disconnectedCallback(): void {
    this.closeAll();
    this.store?.removeEventListener('change', this.onChange);
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('store')) {
      (changed.get('store') as HomeStore | null | undefined)?.removeEventListener('change', this.onChange);
      this.store?.addEventListener('change', this.onChange);
    }
    const previous = changed.get('orga') as OrganisationSummary | undefined;
    if ((changed.has('orga') && previous?.id !== this.orga?.id) || changed.has('client')) {
      this.openFromUrl();
    }
  }

  override updated(): void {
    if (!this.autoscroll) {
      return;
    }
    for (const lines of this.renderRoot.querySelectorAll<HTMLElement>('.lines')) {
      lines.scrollTop = lines.scrollHeight;
    }
  }

  /** The applications of `?apps=` this organisation knows, in that order, up to the cap. */
  private openFromUrl(): void {
    this.closeAll();
    if (this.orga == null || this.client == null) {
      return;
    }
    const byId = new Map(this.orga.applications.filter((app) => !app.isArchived).map((app) => [app.id, app]));
    const wanted = [...new Set((readHashParams().get('apps') ?? '').split(',').filter(Boolean))]
      .map((id) => byId.get(id))
      .filter((app): app is ApplicationSummary => app != null);
    this.apps = wanted.slice(0, MAX_APPS);
    this.overflow = wanted.length - this.apps.length;
    for (const app of this.apps) {
      this.openStream(app.id);
    }
  }

  private openStream(appId: string): void {
    const { client } = this;
    const ownerId = this.orga.id;
    const stream = new LogStream<ApplicationRuntimeLog>((since) => openRuntimeLogs(client, ownerId, appId, { since }));
    stream.addEventListener('change', this.onChange);
    this.#streams.set(appId, stream);
    void stream.start(sinceMinutes(this.since));
  }

  private closeAll(): void {
    for (const stream of this.#streams.values()) {
      stream.stop();
      stream.removeEventListener('change', this.onChange);
    }
    this.#streams.clear();
  }

  /** Takes an application out of the view, and out of the URL so a reload agrees. */
  private removeApp(appId: string): void {
    const stream = this.#streams.get(appId);
    stream?.stop();
    stream?.removeEventListener('change', this.onChange);
    this.#streams.delete(appId);
    this.apps = this.apps.filter((app) => app.id !== appId);
    writeHashParams({ apps: this.apps.map((app) => app.id).join(',') });
  }

  private setLayout(layout: Layout): void {
    this.layout = layout;
    try {
      localStorage.setItem(LAYOUT_KEY, layout);
    } catch {
      // Not essential.
    }
  }

  private setSince(since: string): void {
    this.since = since;
    for (const stream of this.#streams.values()) {
      stream.clear();
      void stream.start(sinceMinutes(since));
    }
  }

  private get allPaused(): boolean {
    const running = [...this.#streams.values()].filter((stream) => stream.running);
    return running.length > 0 && running.every((stream) => stream.status === 'paused');
  }

  private togglePauseAll(): void {
    const pause = !this.allPaused;
    for (const stream of this.#streams.values()) {
      if (pause) {
        stream.pause();
      } else {
        stream.resume();
      }
    }
  }

  private lineMatches(log: ApplicationRuntimeLog, appId: string): boolean {
    const text = runtimeSearchText(log);
    const global = this.filter.trim().toLowerCase();
    const local = (this.panelFilters.get(appId) ?? '').trim().toLowerCase();
    return (global === '' || text.includes(global)) && (local === '' || text.includes(local));
  }

  private lastDeployment(appId: string): Deployment | null {
    const deployments = this.store?.get(this.orga.id).deployments ?? null;
    if (deployments !== this.#activitySource) {
      this.#activitySource = deployments;
      this.#activity = indexActivity(deployments ?? []);
    }
    return this.#activity.get(appId)?.last ?? null;
  }

  /** A page of this organisation, keeping the home list the user came from. */
  private href(route: Route): string {
    return keepListView(routeToHash(route), route, window.location.hash);
  }

  override render() {
    if (this.orga == null) {
      return nothing;
    }
    const commands = this.apps.map((app) => `clever logs --app ${app.id}${sinceFlag(this.since)}`);
    return html`
      <header class="head">
        <a class="back" href=${this.href({ kind: 'orga', ownerId: this.orga.id })}>← ${t('nav.back')}</a>
        <h1>${t('multilogs.title', { count: this.apps.length })}</h1>
        ${
          commands.length > 0
            ? html`<cvc-cli .command=${commands[0]} .script=${commands.join('\n')} .count=${commands.length}></cvc-cli>`
            : nothing
        }
      </header>
      ${
        this.overflow > 0
          ? html`<p class="warning small" role="status">
              ${t('multilogs.overflow', { max: MAX_APPS, count: this.apps.length + this.overflow })}
            </p>`
          : nothing
      }
      ${this.apps.length === 0 ? html`<p class="empty">${t('multilogs.none')}</p>` : this.renderBody()}
    `;
  }

  private renderBody() {
    return html`
      <div class="row toolbar">
        <label class="row small">
          ${t('multilogs.layoutAria')}
          <select
            @change=${(event: Event) => this.setLayout((event.currentTarget as HTMLSelectElement).value as Layout)}
          >
            ${LAYOUTS.map(
              (layout) =>
                html`<option value=${layout.value} ?selected=${layout.value === this.layout}>
                  ${t(layout.label)}
                </option>`,
            )}
          </select>
        </label>
        <span class="grow"></span>
        <label class="row small">
          ${t('logs.since')}
          <select @change=${(event: Event) => this.setSince((event.currentTarget as HTMLSelectElement).value)}>
            ${SINCE_OPTIONS.map(
              (option) =>
                html`<option value=${option.value} ?selected=${option.value === this.since}>
                  ${t(option.label)}
                </option>`,
            )}
          </select>
        </label>
        <input
          type="search"
          placeholder=${t('logs.filter')}
          aria-label=${t('logs.filter')}
          .value=${this.filter}
          @input=${(event: Event) => (this.filter = (event.currentTarget as HTMLInputElement).value)}
        />
        <label class="row small">
          <input
            type="checkbox"
            .checked=${this.autoscroll}
            @change=${(event: Event) => (this.autoscroll = (event.currentTarget as HTMLInputElement).checked)}
          />
          ${t('logs.follow')}
        </label>
        <button type="button" class="ghost" @click=${this.togglePauseAll}>
          ${this.allPaused ? t('multilogs.resumeAll') : t('multilogs.pauseAll')}
        </button>
        <button
          type="button"
          class="ghost with-icon"
          title=${t('multilogs.reconnectTitle')}
          @click=${() => this.setSince(this.since)}
        >
          ${ICON_REFRESH} ${t('multilogs.reconnect')}
        </button>
        <button
          type="button"
          class="ghost"
          @click=${() => {
            for (const stream of this.#streams.values()) {
              stream.clear();
            }
          }}
        >
          ${t('multilogs.clearAll')}
        </button>
      </div>
      ${this.layout === 'merged' ? this.renderMerged() : this.renderGrid()}
    `;
  }

  private renderGrid() {
    return html`<div class="grid cols-${this.layout}">
      ${repeat(
        this.apps,
        (app) => app.id,
        (app) => this.renderPanel(app),
      )}
    </div>`;
  }

  private renderPanel(app: ApplicationSummary) {
    const stream = this.#streams.get(app.id);
    const lines = (stream?.lines ?? []).filter((log) => this.lineMatches(log, app.id));
    const status = streamStatusLabel(stream?.status ?? 'idle');
    const appState = appStatus(app.state, this.lastDeployment(app.id));
    const error = streamError(stream?.error ?? null, stream?.retries ?? 0);
    return html`<section class="panel card">
      <header class="panel-head">
        <span class="state" title=${statusMessage(appState)}>${statusIcon(appState)}</span>
        <a
          class="name"
          href=${this.href({ kind: 'app', ownerId: this.orga.id, appId: app.id, tab: 'logs' })}
          title=${t('multilogs.openApp')}
          >${app.name}</a
        >
        <span class="badge ${status.tone}" title=${status.label}>${status.label}</span>
        <span class="muted small count">${lines.length}</span>
        <span class="grow"></span>
        <input
          type="search"
          class="panel-filter"
          placeholder=${t('multilogs.panelFilter')}
          aria-label=${t('multilogs.panelFilterAria', { name: app.name })}
          .value=${this.panelFilters.get(app.id) ?? ''}
          @input=${(event: Event) =>
            (this.panelFilters = new Map(this.panelFilters).set(
              app.id,
              (event.currentTarget as HTMLInputElement).value,
            ))}
        />
        <button type="button" class="ghost small" ?disabled=${!stream?.running} @click=${() => stream?.togglePause()}>
          ${stream?.status === 'paused' ? t('logs.resume') : t('logs.pause')}
        </button>
        <button
          type="button"
          class="ghost small close"
          title=${t('multilogs.close')}
          aria-label=${t('multilogs.close')}
          @click=${() => this.removeApp(app.id)}
        >
          ×
        </button>
      </header>
      ${error ? html`<p class="error small" role="alert">${error}</p>` : nothing}
      <div class="lines" role="log" aria-live="off">
        ${
          lines.length === 0
            ? html`<p class="empty">${stream?.status === 'open' ? t('logs.waiting') : ''}</p>`
            : repeat(
                lines,
                (log) => log.id,
                (log) => renderRuntimeLine(log),
              )
        }
      </div>
    </section>`;
  }

  private renderMerged() {
    const sources = this.apps.map((app) => ({ appId: app.id, lines: this.#streams.get(app.id)?.lines ?? [] }));
    const key = [
      ...this.apps.map((app) => `${app.id}:${this.#streams.get(app.id)?.version ?? 0}`),
      ...[...this.hiddenApps].map((id) => `-${id}`),
    ].join('|');
    if (key !== this.#merged.key) {
      this.#merged = { key, lines: mergeLines(sources, this.hiddenApps, MAX_MERGED) };
    }
    const names = new Map(this.apps.map((app) => [app.id, app.name]));
    const hues = distinctHues(this.apps.map((app) => app.id));
    const color = (appId: string) => hueColor(hues.get(appId) ?? 0);
    const tint = (appId: string) => hueTint(hues.get(appId) ?? 0);
    const lines = this.#merged.lines.filter((entry) => this.lineMatches(entry.line, entry.appId));
    return html`
      <div class="legend">
        ${this.apps.map((app) => {
          const hidden = this.hiddenApps.has(app.id);
          const status = streamStatusLabel(this.#streams.get(app.id)?.status ?? 'idle');
          return html`<button
            type="button"
            class="chip ${hidden ? 'off' : ''}"
            aria-pressed=${!hidden}
            title="${status.label} · ${t('multilogs.legendHint')}"
            @click=${() => {
              const next = new Set(this.hiddenApps);
              if (hidden) {
                next.delete(app.id);
              } else {
                next.add(app.id);
              }
              this.hiddenApps = next;
            }}
          >
            <span class="dot" ${inlineStyle({ background: color(app.id) })}></span>${app.name}
          </button>`;
        })}
        <span class="muted small">${t('multilogs.noCli')}</span>
      </div>
      <div class="lines merged card" role="log" aria-live="off">
        ${
          lines.length === 0
            ? html`<p class="empty">${t('logs.waiting')}</p>`
            : repeat(
                lines,
                (entry) => `${entry.appId}/${entry.line.id}`,
                (entry) =>
                  html`<div class="line sev-${entry.line.severity}" ${inlineStyle({ background: tint(entry.appId) })}>
                    <time datetime=${entry.line.date} title=${entry.line.date}>${formatTime(entry.line.date)}</time>
                    <span class="app" ${inlineStyle({ color: color(entry.appId) })} title=${entry.line.service}
                      >${names.get(entry.appId) ?? entry.appId}</span
                    >
                    <span class="message">${entry.line.message}</span>
                  </div>`,
              )
        }
      </div>
    `;
  }

  static override styles = [
    sharedStyles,
    logStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-height: 0;
      }
      .head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
      }
      .head h1 {
        margin: 0;
        font-size: 1.3rem;
      }
      .back {
        font-weight: 600;
        color: var(--cvc-text);
        text-decoration: none;
      }
      .back:hover {
        color: var(--cvc-accent);
      }
      .warning {
        margin: 0;
        color: var(--cvc-warn);
      }
      .toolbar select,
      .toolbar input[type='search'] {
        padding: 0.3rem 0.5rem;
      }
      .toolbar input[type='search'] {
        width: 200px;
      }
      .grow {
        flex: 1;
      }
      .grid {
        display: grid;
        gap: 0.75rem;
      }
      .grid.cols-1 {
        grid-template-columns: minmax(0, 1fr);
      }
      .grid.cols-2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .grid.cols-3 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      @media (max-width: 900px) {
        .grid.cols-2,
        .grid.cols-3 {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .panel {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 0.6rem 0.75rem 0.5rem;
      }
      .panel-head {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        min-width: 0;
        margin-bottom: 0.4rem;
      }
      .panel-head .state {
        display: inline-flex;
        flex: none;
      }
      .panel-head .name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      .panel-head .badge,
      .panel-head .count,
      .panel-head button {
        flex: none;
      }
      .panel-filter {
        width: 9rem;
        min-width: 0;
        padding: 0.2rem 0.45rem;
        font-size: 0.8rem;
      }
      button.small {
        padding: 0.15rem 0.5rem;
        font-size: 0.8rem;
      }
      .close {
        font-size: 1rem;
        line-height: 1;
      }
      .panel .lines {
        height: 320px;
        padding: 0.3rem 0.25rem;
        border-top: 1px solid var(--cvc-border);
      }
      .cols-1 .panel .lines {
        height: 460px;
      }
      /* Three panels side by side: the stream state as its dot alone (label in the title), a
         narrower filter, and no service column, so the name keeps its room. */
      .cols-3 .panel-head .badge {
        gap: 0;
        padding: 0.3rem;
        font-size: 0;
      }
      .cols-3 .panel-filter {
        width: 6rem;
      }
      /* Three panels side by side leave no room for the service column. */
      .cols-3 .line {
        grid-template-columns: 8ch minmax(0, 1fr);
      }
      .cols-3 .line .service {
        display: none;
      }
      .error.small {
        margin: 0 0 0.4rem;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.15rem 0.6rem;
        font-size: 0.8rem;
        border-radius: 999px;
      }
      .chip.off {
        opacity: 0.45;
        text-decoration: line-through;
      }
      .dot {
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 50%;
      }
      .lines.merged {
        flex: 1;
        min-height: 420px;
        height: calc(100vh - 300px);
      }
      /* Each line on a wash of its application's colour: the feed reads by application at a glance. */
      .lines.merged {
        padding: 0.3rem;
      }
      .lines.merged .line {
        padding: 0.05rem 0.45rem;
        border-radius: 3px;
      }
      .lines.merged .line + .line {
        margin-top: 1px;
      }
      .lines.merged .line {
        grid-template-columns: 8ch 18ch minmax(0, 1fr);
      }
      .lines.merged .app {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
    `,
  ];
}

function readLayout(): Layout {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY);
    return stored === '1' || stored === '2' || stored === '3' || stored === 'merged' ? stored : '2';
  } catch {
    return '2';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-logs-page': CvcLogsPage;
  }
}
