import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { deploymentLogsCommand, deploymentSince } from '../../core/logs/deployment-logs.js';
import { distinctHues, hueColor, hueTint, mergeLines } from '../../core/logs/merge.js';
import { LogStream, MAX_LINES, type StreamStatus } from '../../core/logs/stream.js';
import { withHashParams } from '../../core/router.js';
import {
  fetchDeployment,
  fetchDeploymentProgress,
  openAccessLogs,
  openRuntimeLogs,
  type ApplicationAccessLog,
  type ApplicationRuntimeLog,
  type Deployment,
  type DeploymentProgress,
} from '../../data/api.js';
import '../shared/cvc-cli.js';
import { CvcElement } from '../shared/cvc-element.js';
import { openAction } from '../shared/events.js';
import {
  deploymentActionLabel,
  DEPLOYMENT_STATE_LABELS,
  formatDateTime,
  formatTime,
  stateLabel,
} from '../shared/format.js';
import { ICON_CLEAR, ICON_PAUSE, ICON_START, ICON_STOP } from '../shared/icons.js';
import { inlineStyle } from '../shared/inline-style.js';
import {
  logStyles,
  renderRuntimeLine,
  runtimeSearchText,
  SINCE_OPTIONS,
  sinceFlag,
  sinceMinutes,
  streamError,
  streamStatusLabel,
} from '../shared/logs.js';
import { sharedStyles } from '../shared/styles.js';

/** What the application writes, the HTTP requests it answered, or both interleaved. */
type LogMode = 'app' | 'access' | 'both';
type LogKind = 'app' | 'access';
type LogLine = ApplicationRuntimeLog | ApplicationAccessLog;

const MODE_KEY = 'cvc.logs.mode';
const MODES: Array<{ value: LogMode; label: MessageKey }> = [
  { value: 'app', label: 'logs.mode.app' },
  { value: 'access', label: 'logs.mode.access' },
  { value: 'both', label: 'logs.mode.both' },
];
const COMMANDS: Record<LogKind, string> = { app: 'clever logs', access: 'clever accesslogs' };
/** A site with traffic fills the access logs much faster than its application logs. */
const MAX_ACCESS_LINES = 5000;
/** Lines the interleaved view keeps, both kinds together. */
const MAX_BOTH = MAX_LINES + MAX_ACCESS_LINES;
/** In the interleaved view, each kind of line has its colour, as an application has in the multi-application view. */
const KIND_HUES = distinctHues(['app', 'access']);
export interface DeploymentEndedDetail {
  ownerId: string;
}

/** How often the state of a deployment in progress is read again. */
const DEPLOYMENT_POLL_MS = 5000;
/** A deployment just asked for may take a moment to be readable: it is asked for again a few times. */
const DEPLOYMENT_WAIT_TRIES = 5;
const DEPLOYMENT_WAIT_MS = 2000;

/**
 * Live logs with pause, filter and replay window: what the application writes
 * (`clever logs`), the HTTP requests it answered (`clever accesslogs`), or
 * both interleaved by date, the requests on a light tint. The chosen kind is
 * remembered in this browser.
 *
 * With `deploymentId` (`?deployment=` in the URL, #13), the lines of that
 * deployment only, from its start (`clever logs --deployment-id … --since …`):
 * why it failed, or a restart followed as it happens, its state read again
 * until it ends, as `clever restart` does.
 */
@customElement('cvc-app-logs')
export class CvcAppLogs extends CvcElement {
  @property({ attribute: false }) client!: CcApiClient;
  @property() ownerId = '';
  @property() appId = '';
  /** Empty for the live logs of the application. */
  @property() deploymentId = '';

  @state() private mode: LogMode = readMode();
  @state() private deployment: DeploymentProgress | null = null;
  /** Its number and author, once it has started. */
  @state() private details: Deployment | null = null;
  @state() private deploymentError: string | null = null;
  @state() private since = '15m';
  @state() private filter = '';
  @state() private autoscroll = true;

  @query('.lines') private container?: HTMLElement;

  /** One stream per kind of logs shown. */
  #streams: Array<{ kind: LogKind; stream: LogStream<LogLine> }> = [];
  #merged: { key: string; lines: LogLine[] } = { key: '', lines: [] };
  #poll: ReturnType<typeof setTimeout> | undefined;
  private readonly onStreamChange = () => this.requestUpdate();

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId') || changed.has('deploymentId')) {
      this.open();
    }
  }

  /** What the view shows: the application logs only for a deployment. */
  private get shownMode(): LogMode {
    return this.deploymentId === '' ? this.mode : 'app';
  }

  override updated(): void {
    if (this.autoscroll && this.container != null) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  override disconnectedCallback(): void {
    this.closeStreams();
    clearTimeout(this.#poll);
    super.disconnectedCallback();
  }

  private closeStreams(): void {
    for (const { stream } of this.#streams) {
      stream.stop();
      stream.removeEventListener('change', this.onStreamChange);
    }
    this.#streams = [];
  }

  /** Fresh streams for the application and the kinds of logs shown, or for the deployment. */
  private open(): void {
    this.closeStreams();
    clearTimeout(this.#poll);
    this.deployment = null;
    this.details = null;
    this.deploymentError = null;
    if (this.client == null || this.appId === '') {
      return;
    }
    if (this.deploymentId !== '') {
      void this.openDeployment();
      return;
    }
    const { client, ownerId, appId, mode } = this;
    const kinds: LogKind[] = mode === 'both' ? ['app', 'access'] : [mode];
    this.#streams = kinds.map((kind) => {
      const stream = new LogStream<LogLine>(
        (since) =>
          kind === 'app'
            ? openRuntimeLogs(client, ownerId, appId, { since })
            : openAccessLogs(client, ownerId, appId, { since }),
        kind === 'access' ? MAX_ACCESS_LINES : MAX_LINES,
      );
      stream.addEventListener('change', this.onStreamChange);
      void stream.start(sinceMinutes(this.since));
      return { kind, stream };
    });
  }

  /**
   * The deployment first (v4: known from the moment it is queued), its date saying where its lines
   * start; then its lines, and its state until it ends. Its number and author come from the v2 API,
   * once it has started.
   */
  private async openDeployment(): Promise<void> {
    const { client, ownerId, appId, deploymentId } = this;
    const current = () => deploymentId === this.deploymentId && appId === this.appId;
    try {
      let progress: DeploymentProgress | null = null;
      for (let attempt = 1; progress == null; attempt += 1) {
        try {
          progress = await fetchDeploymentProgress(client, ownerId, appId, deploymentId);
        } catch (error) {
          if (attempt >= DEPLOYMENT_WAIT_TRIES || !current()) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, DEPLOYMENT_WAIT_MS));
        }
      }
      if (!current()) {
        return;
      }
      this.deployment = progress;
      this.openDeploymentStream();
      void this.readDetails();
      this.followDeployment();
    } catch (error) {
      if (current()) {
        this.deploymentError = describeError(error);
      }
    }
  }

  /**
   * The lines of the deployment, once it has left the queue: before, the logs API does not know it
   * yet (clever-tools says "Application not found"), and `clever restart` waits for it too.
   */
  private openDeploymentStream(): void {
    const deployment = this.deployment;
    if (deployment == null || this.#streams.length > 0 || !hasStarted(deployment)) {
      return;
    }
    const { client, ownerId, appId, deploymentId } = this;
    const since = deploymentSince(deployment.startsAt);
    const stream = new LogStream<LogLine>(() => openRuntimeLogs(client, ownerId, appId, { since, deploymentId }));
    stream.addEventListener('change', this.onStreamChange);
    this.#streams = [{ kind: 'app', stream }];
    void stream.start(minutesSince(since));
  }

  /**
   * The number and author of the deployment, which the v2 API knows once it has started; read again
   * when it ends (`again`), since only v2 tells a cancelled deployment: v4 says it succeeded.
   */
  private async readDetails(again = false): Promise<void> {
    const { client, ownerId, appId, deploymentId } = this;
    if ((this.details != null && !again) || this.deployment == null || this.deployment.state === 'QUEUED') {
      return;
    }
    try {
      const details = await fetchDeployment(client, ownerId, appId, deploymentId);
      if (deploymentId === this.deploymentId) {
        this.details = details;
      }
    } catch {
      // Not essential: read again at the next turn.
    }
  }

  /** While queued or in progress, the state is read again; once it ends, the pages hear of it. */
  private followDeployment(): void {
    if (this.deployment == null || !isUnderway(this.deployment)) {
      return;
    }
    const { client, ownerId, appId, deploymentId } = this;
    this.#poll = setTimeout(async () => {
      try {
        const next = await fetchDeploymentProgress(client, ownerId, appId, deploymentId);
        if (deploymentId !== this.deploymentId) {
          return;
        }
        this.deployment = next;
        this.openDeploymentStream();
        void this.readDetails(!isUnderway(next));
        if (!isUnderway(next)) {
          // Over: the application's state and its last deployment change on every page.
          this.dispatchEvent(
            new CustomEvent<DeploymentEndedDetail>('cvc-deployment-ended', {
              detail: { ownerId },
              bubbles: true,
              composed: true,
            }),
          );
        }
      } catch {
        // Read again at the next turn.
      }
      this.followDeployment();
    }, DEPLOYMENT_POLL_MS);
  }

  private get running(): boolean {
    return this.#streams.some(({ stream }) => stream.running);
  }

  /** One state for the streams shown: an error or a connection first, paused only when all are. */
  private get status(): StreamStatus {
    const statuses = this.#streams.map(({ stream }) => stream.status);
    if (statuses.length === 0) {
      return 'idle';
    }
    for (const status of ['error', 'connecting'] as const) {
      if (statuses.includes(status)) {
        return status;
      }
    }
    if (statuses.every((status) => status === 'paused')) {
      return 'paused';
    }
    return statuses.includes('open') ? 'open' : statuses[0];
  }

  private togglePause(): void {
    const pause = this.status !== 'paused';
    for (const { stream } of this.#streams) {
      if (pause) {
        stream.pause();
      } else {
        stream.resume();
      }
    }
  }

  private restart(): void {
    const minutes =
      this.deployment == null ? sinceMinutes(this.since) : minutesSince(deploymentSince(this.deployment.startsAt));
    for (const { stream } of this.#streams) {
      stream.clear();
      void stream.start(minutes);
    }
  }

  /** Every line shown, oldest first: one stream as it came, two interleaved by date. */
  private get allLines(): LogLine[] {
    if (this.#streams.length === 1) {
      return this.#streams[0].stream.lines;
    }
    const key = this.#streams.map(({ kind, stream }) => `${kind}:${stream.version}`).join('|');
    if (key !== this.#merged.key) {
      const sources = this.#streams.map(({ kind, stream }) => ({ appId: kind, lines: stream.lines }));
      this.#merged = { key, lines: mergeLines(sources, new Set(), MAX_BOTH).map((entry) => entry.line) };
    }
    return this.#merged.lines;
  }

  private setMode(mode: LogMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Not essential.
    }
    this.open();
  }

  private get visibleLines(): LogLine[] {
    const lines = this.allLines;
    const needle = this.filter.trim().toLowerCase();
    return needle === '' ? lines : lines.filter((log) => searchText(log).includes(needle));
  }

  override render() {
    const status = streamStatusLabel(this.status);
    const total = this.allLines.length;
    const visible = this.visibleLines;
    const errors = this.#streams
      .map(({ kind, stream }) => {
        const error = streamError(stream.error, stream.retries);
        return error == null ? null : this.#streams.length > 1 ? `${t(`logs.mode.${kind}`)} : ${error}` : error;
      })
      .filter((error): error is string => error != null);
    const forDeployment = this.deploymentId !== '';
    const mode = this.shownMode;
    const both = mode === 'both';
    const command = forDeployment
      ? this.deployment == null
        ? null
        : deploymentLogsCommand(this.appId, this.deploymentId, deploymentSince(this.deployment.startsAt))
      : both
        ? null
        : `${COMMANDS[mode as LogKind]} --app ${this.appId}${sinceFlag(this.since)}`;
    const paused = this.status === 'paused';
    return html`
      ${forDeployment ? this.renderDeploymentBanner() : nothing}
      <div class="toolbar">
        <div class="row">
          ${
            forDeployment
              ? nothing
              : html`<div class="seg" role="group" aria-label=${t('logs.modeAria')}>
                  ${MODES.map(
                    (option) =>
                      html`<button
                        type="button"
                        class=${option.value === this.mode ? 'on' : ''}
                        aria-pressed=${option.value === this.mode}
                        @click=${() => this.setMode(option.value)}
                      >
                        ${t(option.label)}
                      </button>`,
                  )}
                </div>`
          }
          ${command != null ? html`<cvc-cli command=${command}></cvc-cli>` : nothing}
          <span class="badge ${status.tone}">${status.label}</span>
          <span class="muted small"
            >${visible.length}${visible.length !== total ? ` / ${total}` : ''} ${t('logs.lines')}</span
          >
        </div>
        <div class="row">
          ${
            forDeployment
              ? nothing
              : html`<label class="row small">
                  <select
                    .value=${this.since}
                    aria-label=${t('logs.since')}
                    title=${t('logs.since')}
                    @change=${this.onSinceChange}
                  >
                    ${SINCE_OPTIONS.map((option) => html`<option value=${option.value} ?selected=${option.value === this.since}>${t(option.label)}</option>`)}
                  </select>
                </label>`
          }
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
          <button
            type="button"
            class="ghost icon-only"
            title=${paused ? t('logs.resume') : t('logs.pause')}
            aria-label=${paused ? t('logs.resume') : t('logs.pause')}
            ?disabled=${!this.running}
            @click=${this.togglePause}
          >
            ${paused ? ICON_START : ICON_PAUSE}
          </button>
          ${
            this.running
              ? html`<button
                  type="button"
                  class="ghost icon-only"
                  title=${t('logs.stop')}
                  aria-label=${t('logs.stop')}
                  @click=${() => this.#streams.forEach(({ stream }) => stream.stop())}
                >
                  ${ICON_STOP}
                </button>`
              : html`<button type="button" class="ghost with-icon" @click=${this.restart}>
                  ${ICON_START} ${t('logs.restart')}
                </button>`
          }
          <button
            type="button"
            class="ghost icon-only"
            title=${t('logs.clear')}
            aria-label=${t('logs.clear')}
            @click=${() => this.#streams.forEach(({ stream }) => stream.clear())}
          >
            ${ICON_CLEAR}
          </button>
        </div>
      </div>
      ${errors.map((error) => html`<p class="error small" role="alert">${error}</p>`)}
      <div class="lines card ${mode}" role="log" aria-live="off">
        ${
          visible.length === 0
            ? html`<p class="empty">${this.emptyMessage()}</p>`
            : repeat(
                visible,
                (log) => `${isAccessLog(log) ? 'access' : 'app'}/${log.id}`,
                (log) => {
                  const kind: LogKind = isAccessLog(log) ? 'access' : 'app';
                  const lead = both ? this.renderKind(kind) : nothing;
                  const tint = both ? hueTint(KIND_HUES.get(kind) ?? 0) : null;
                  return isAccessLog(log) ? this.renderAccessLine(log, lead, tint) : renderRuntimeLine(log, lead, tint);
                },
              )
        }
      </div>
    `;
  }

  /**
   * One request: time, status, method, path, duration, bytes sent, client address. The host the
   * API reports is the Clever Cloud load balancer, not the requested domain: it stays in the title.
   */
  private renderAccessLine(log: ApplicationAccessLog, lead: unknown = nothing, tint: string | null = null) {
    const { request, response } = log.detail;
    const place = [log.source.city, log.source.countryCode].filter((part) => part !== '' && part != null).join(', ');
    return html`<div
      class="line access s${Math.floor(response.statusCode / 100)}xx"
      ${inlineStyle({ background: tint })}
    >
      <time datetime=${log.date} title=${log.date}>${formatTime(log.date)}</time>
      ${lead}
      <span class="status">${response.statusCode}</span>
      <span class="method">${request.method}</span>
      <span class="message" title="${request.scheme} · ${request.host}">${request.path}</span>
      <span class="num">${response.time} ms</span>
      <span class="num">${formatBytes(log.bytesOut)}</span>
      <span class="ip" title=${place}>${log.source.ip}</span>
    </div>`;
  }

  /** Why there is no line yet: still queued, never started, or waiting for the first one. */
  private emptyMessage(): string {
    const deployment = this.deployment;
    if (this.deploymentId !== '' && deployment != null && !hasStarted(deployment)) {
      return isUnderway(deployment) ? t('logs.deployment.queued') : t('logs.deployment.neverStarted');
    }
    return this.status === 'open' ? t('logs.waiting') : '';
  }

  /**
   * Which deployment, its state (followed while in progress), what it did and
   * when, and the way back to the live logs.
   */
  private renderDeploymentBanner() {
    const back = withHashParams(window.location.hash, { deployment: null });
    const deployment = this.deployment;
    if (deployment == null) {
      return html`<div class="deployment card row">
        ${
          this.deploymentError != null
            ? html`<span class="danger small">${this.deploymentError}</span>`
            : html`<span class="muted small">${t('logs.deployment.waiting')}</span>`
        }
        <span class="grow"></span>
        <a class="small" href=${back}>${t('logs.deployment.back')}</a>
      </div>`;
    }
    // A cancelled deployment ends as SUCCEEDED in v4: v2 knows better (#33).
    const ended = !isUnderway(deployment) && this.details?.state === 'CANCELLED' ? 'CANCELLED' : deployment.state;
    const state = stateLabel(DEPLOYMENT_STATE_LABELS, ended);
    const facts = [
      deploymentActionLabel(deployment.origin.action),
      // Without its number yet, the title already gives the date.
      this.details == null ? '' : formatDateTime(deployment.startsAt),
      deployment.origin.cause ?? '',
      this.details?.author?.name ?? '',
    ].filter((part) => part !== '');
    return html`<div class="deployment card row">
      <strong
        >${
          this.details == null
            ? t('logs.deployment.titleAt', { date: formatDateTime(deployment.startsAt) })
            : t('logs.deployment.title', { index: this.details.index })
        }</strong
      >
      <span class="badge ${state.tone}">${state.label}</span>
      <span class="muted small">${facts.join(' · ')}</span>
      ${isUnderway(deployment) ? html`<span class="muted small">${t('logs.deployment.following')}</span>` : nothing}
      <span class="grow"></span>
      ${
        isUnderway(deployment)
          ? html`<button
              type="button"
              class="ghost small cancel"
              @click=${() => openAction(this, 'cancel-deploy', { deploymentId: this.deploymentId })}
            >
              ${t('app.cancelDeploy')}
            </button>`
          : nothing
      }
      <a class="small" href=${back}>${t('logs.deployment.back')}</a>
    </div>`;
  }

  /** Where a line comes from, in the interleaved view, in the colour of its kind. */
  private renderKind(kind: LogKind) {
    return html`<span class="kind" ${inlineStyle({ color: hueColor(KIND_HUES.get(kind) ?? 0) })}
      >${t(`logs.mode.${kind}`)}</span
    >`;
  }

  private onSinceChange(event: Event): void {
    this.since = (event.currentTarget as HTMLSelectElement).value;
    this.restart();
  }

  static override styles = [
    sharedStyles,
    logStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }
      .deployment {
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
        margin-bottom: 0.6rem;
        padding: 0.6rem 0.9rem;
      }
      .deployment .grow {
        flex: 1;
      }
      .deployment button.cancel {
        color: var(--cvc-danger);
      }
      .danger {
        color: var(--cvc-danger);
      }
      /* Two groups that wrap as wholes: what is shown on the left, the controls on the right. */
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem 1rem;
        margin-bottom: 0.6rem;
      }
      .toolbar > .row {
        flex-wrap: nowrap;
        min-width: 0;
      }
      /* The command shortened: a click on it copies it whole. */
      .toolbar cvc-cli {
        max-width: 13rem;
      }
      button.icon-only {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.45rem 0.55rem;
      }
      .toolbar select,
      .toolbar input[type='search'] {
        padding: 0.3rem 0.5rem;
      }
      .toolbar input[type='search'] {
        width: 150px;
      }
      .grow {
        flex: 1;
      }
      .error.small {
        margin-bottom: 0.5rem;
      }
      .lines {
        flex: 1;
        min-height: 300px;
      }
      .line.access {
        grid-template-columns: 8ch 3ch 7ch minmax(0, 1fr) 8ch 8ch 15ch;
        white-space: nowrap;
      }
      /* Both kinds interleaved: each line says its kind after the time, on a wash of that kind's colour. */
      .lines.both .line {
        grid-template-columns: 8ch 11ch 12ch minmax(0, 1fr);
        padding: 0.05rem 0.4rem;
        border-radius: 3px;
      }
      .lines.both .line + .line {
        margin-top: 1px;
      }
      .lines.both .line.access {
        grid-template-columns: 8ch 11ch 3ch 7ch minmax(0, 1fr) 8ch 8ch 15ch;
      }
      .lines.both .kind {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .line.access .message {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .line.access .method,
      .line.access .ip {
        color: var(--cvc-muted);
      }
      .line.access .num {
        text-align: right;
        color: var(--cvc-muted);
      }
      .line.access .ip {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .line.s2xx .status {
        color: var(--cvc-ok);
      }
      .line.s3xx .status {
        color: var(--cvc-info);
      }
      .line.s4xx .status {
        color: var(--cvc-warn);
      }
      .line.s5xx .status,
      .line.s5xx .message {
        color: var(--cvc-danger);
      }
    `,
  ];
}

function isAccessLog(log: LogLine): log is ApplicationAccessLog {
  return 'detail' in log;
}

/** What the filter field looks into. */
function searchText(log: LogLine): string {
  if (!isAccessLog(log)) {
    return runtimeSearchText(log);
  }
  const { request, response } = log.detail;
  return `${response.statusCode} ${request.method} ${request.host}${request.path} ${log.source.ip} ${log.source.city}`.toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readMode(): LogMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === 'access' || stored === 'both' ? stored : 'app';
  } catch {
    return 'app';
  }
}

/** Out of the queue at some point: it has lines, or will have. */
function hasStarted(deployment: DeploymentProgress): boolean {
  return deployment.state !== 'QUEUED' && deployment.steps.some((step) => step.state !== 'QUEUED');
}

/** Queued, or running: its state is followed. */
function isUnderway(deployment: DeploymentProgress): boolean {
  return (
    deployment.state === 'QUEUED' || deployment.state === 'WORK_IN_PROGRESS' || deployment.state === 'TASK_IN_PROGRESS'
  );
}

/** The minutes back to a date, for a stream replaying from it. */
function minutesSince(since: Date): number {
  return Math.max(1, Math.ceil((Date.now() - since.getTime()) / 60_000));
}

declare global {
  interface HTMLElementTagNameMap {
    'cvc-app-logs': CvcAppLogs;
  }
}
