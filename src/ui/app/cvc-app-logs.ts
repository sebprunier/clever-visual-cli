import type { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { describeError } from '../../core/clever-client.js';
import { t, type MessageKey } from '../../core/i18n.js';
import { deploymentLogsCommand, deploymentSince } from '../../core/logs/deployment-logs.js';
import {
  assignHues,
  byCreation,
  countLines,
  fromApi,
  groupInstances,
  inSelection,
  instancesCommand,
  keepAvailable,
  parseSelection,
  selectionParam,
  unknownInstance,
  unlisted,
  type InstanceGroup,
  type LogInstance,
} from '../../core/logs/instances.js';
import { distinctHues, hueColor, hueTint, mergeLines } from '../../core/logs/merge.js';
import { LogStream, MAX_LINES, type StreamStatus } from '../../core/logs/stream.js';
import { readHashParams, withHashParams, writeHashParams } from '../../core/router.js';
import {
  fetchDeployment,
  fetchDeploymentProgress,
  fetchDeployments,
  fetchInstance,
  fetchLogInstances,
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
  formatRelative,
  formatTime,
  INSTANCE_STATE_LABELS,
  stateLabel,
  type StateLabel,
} from '../shared/format.js';
import { ICON_CLEAR, ICON_EYE, ICON_EYE_OFF, ICON_PAUSE, ICON_START, ICON_STOP } from '../shared/icons.js';
import { inlineStyle } from '../shared/inline-style.js';
import {
  logStyles,
  renderRuntimeLine,
  runtimeSearchText,
  type RuntimeLineOptions,
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

/** The instances panel open or closed (#38), remembered in this browser; open by default. */
const INSTANCES_KEY = 'cvc.logs.instances';
/** While the lines come, the instances are read again this often: their states move. */
const INSTANCES_REFRESH_MS = 30_000;
/** Instances the list lacks, looked up one by one at most, per window. */
const MAX_LOOKUPS = 20;
/** The widest window: the panel says how many more instances it would list. */
const WIDEST = SINCE_OPTIONS[SINCE_OPTIONS.length - 1];
/** What the list of each window covers, said above it. */
const SCOPES: Readonly<Record<string, MessageKey>> = {
  now: 'logs.instances.scope.now',
  '15m': 'logs.instances.scope.15m',
  '1h': 'logs.instances.scope.1h',
  '6h': 'logs.instances.scope.6h',
  '24h': 'logs.instances.scope.24h',
};

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
 *
 * Beside the lines, the instances that wrote them (#38), by deployment: ticking some keeps
 * their lines only (`?instances=`), nothing ticked shows every line.
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
  @state() private instancesOpen = readInstancesOpen();
  /** The instances whose lines are shown; empty for every line. */
  @state() private selection: ReadonlySet<string> = new Set();
  @state() private instancesLoaded = false;
  @state() private instancesError: string | null = null;

  @query('.lines') private container?: HTMLElement;

  /** One stream per kind of logs shown. */
  #streams: Array<{ kind: LogKind; stream: LogStream<LogLine> }> = [];
  #merged: { key: string; lines: LogLine[] } = { key: '', lines: [] };
  #poll: ReturnType<typeof setTimeout> | undefined;
  /** The instances of the window, by id: listed by the API, or looked up from their lines. */
  #instances = new Map<string, LogInstance>();
  /** The instances of the widest window, read once per window: those the panel leaves out are counted. */
  #wider: ReadonlyMap<string, unknown> = new Map();
  /** The deployments that created them, by id. */
  #deployments = new Map<string, Deployment>();
  /** Deployments asked for one by one, once each. */
  #deploymentsAsked = new Set<string>();
  /** The colour of each instance, kept while the window lasts. */
  #hues = new Map<string, number>();
  /** Ids that wrote lines without being listed: the list is read again, then each is looked up alone. */
  #asked = new Set<string>();
  #lookUp = new Set<string>();
  /** Instances looked up alone in this window, up to `MAX_LOOKUPS`. */
  #lookups = 0;
  /** Bumped when the window changes: a list read for the previous one is dropped. */
  #instancesGeneration = 0;
  #listing = false;
  #relist = false;
  /** Where the window starts: the instances alive since then are listed. */
  #windowStart = new Date();
  #instancesTimer: ReturnType<typeof setInterval> | undefined;
  #counts: { lines: LogLine[] | null; counts: Map<string, number> } = { lines: null, counts: new Map() };
  private readonly onStreamChange = () => {
    this.requestUpdate();
    this.checkUnlisted();
  };

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('client') || changed.has('ownerId') || changed.has('appId') || changed.has('deploymentId')) {
      this.open();
      this.resetInstances();
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

  override connectedCallback(): void {
    super.connectedCallback();
    clearInterval(this.#instancesTimer);
    this.#instancesTimer = setInterval(() => {
      if (this.running) {
        this.loadInstances();
      }
    }, INSTANCES_REFRESH_MS);
  }

  override disconnectedCallback(): void {
    this.closeStreams();
    clearTimeout(this.#poll);
    clearInterval(this.#instancesTimer);
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
    this.#windowStart = windowStart(this.since);
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
    if (this.deploymentId === '') {
      this.#windowStart = windowStart(this.since);
    }
    this.newWindow();
  }

  /** Another application or deployment: its instances from scratch, the selection from the address. */
  private resetInstances(): void {
    this.#instances = new Map();
    this.#deployments = new Map();
    this.#deploymentsAsked = new Set();
    this.#hues = new Map();
    this.instancesLoaded = false;
    this.instancesError = null;
    this.selection = parseSelection(readHashParams().get('instances'));
    this.newWindow();
  }

  /** Another window: the instances of the previous one stay shown until those of the new one come. */
  private newWindow(): void {
    this.#instancesGeneration += 1;
    this.#listing = false;
    this.#relist = false;
    this.#asked = new Set();
    this.#lookUp = new Set();
    this.#lookups = 0;
    this.#wider = new Map();
    this.loadInstances(true);
    void this.loadWider();
  }

  /**
   * The instances of the last 24 hours, read once for a shorter window: the panel says how many
   * more it would list, a redeployment of a few hours ago being out of a 15-minute window.
   */
  private async loadWider(): Promise<void> {
    const { client, ownerId, appId, deploymentId } = this;
    if (client == null || appId === '' || deploymentId !== '' || this.since === WIDEST.value) {
      return;
    }
    const generation = this.#instancesGeneration;
    try {
      const since = new Date(Date.now() - WIDEST.minutes * 60_000);
      const instances = await fetchLogInstances(client, ownerId, appId, { since });
      if (generation === this.#instancesGeneration) {
        this.#wider = new Map(instances.map((instance) => [instance.id, instance]));
        this.requestUpdate();
      }
    } catch {
      // Nothing said: the panel lists the window all the same.
    }
  }

  /** The widest window, from the panel: as if chosen in the toolbar. */
  private widen(): void {
    this.since = WIDEST.value;
    this.restart();
  }

  /**
   * Reads the instances of the window: those of the deployment, or those alive since its start.
   * One read at a time: one asked meanwhile runs after it. Then the ids still missing are looked
   * up alone, and the deployments the list of the last 20 lacks are read one by one.
   */
  private loadInstances(fresh = false): void {
    const { client, ownerId, appId, deploymentId } = this;
    if (client == null || appId === '') {
      return;
    }
    if (this.#listing) {
      this.#relist = true;
      return;
    }
    this.#listing = true;
    const generation = this.#instancesGeneration;
    const window = deploymentId !== '' ? { deploymentId } : { since: this.#windowStart };
    void Promise.all([
      fetchLogInstances(client, ownerId, appId, window),
      fetchDeployments(client, ownerId, appId).catch(() => []),
    ])
      .then(([instances, deployments]) => {
        if (generation !== this.#instancesGeneration) {
          return;
        }
        for (const deployment of deployments) {
          this.#deployments.set(deployment.id, deployment);
        }
        const listed = new Map(instances.map((instance) => [instance.id, fromApi(instance)]));
        // Those looked up from their lines stay, until a new window.
        for (const id of this.#asked) {
          const known = this.#instances.get(id);
          if (known != null && !listed.has(id)) {
            listed.set(id, known);
          }
        }
        this.#instances = listed;
        this.#hues = assignHues(this.#hues, byCreation(listed.values()), appId);
        this.instancesLoaded = true;
        this.instancesError = null;
        if (fresh) {
          this.setSelection(keepAvailable(this.selection, new Map<string, unknown>([...listed, ...this.lineCounts])));
        }
        this.requestUpdate();
        void this.lookUpMissing(generation);
        void this.readMissingDeployments(generation);
        // Lines that came before the list, from instances it lacks.
        this.checkUnlisted();
      })
      .catch((error: unknown) => {
        if (generation === this.#instancesGeneration) {
          this.instancesLoaded = true;
          this.instancesError = describeError(error);
        }
      })
      .finally(() => {
        if (generation !== this.#instancesGeneration) {
          return;
        }
        this.#listing = false;
        if (this.#relist) {
          this.#relist = false;
          this.loadInstances();
        }
      });
  }

  /**
   * Lines from instances the panel does not know: the list is read again (a new instance of a
   * redeployment), and those it still lacks are looked up alone afterwards.
   */
  private checkUnlisted(): void {
    if (!this.instancesLoaded || this.instancesError != null) {
      return;
    }
    const missing = unlisted(this.lineCounts, this.#instances).filter((id) => !this.#asked.has(id));
    if (missing.length === 0) {
      return;
    }
    for (const id of missing) {
      this.#asked.add(id);
      this.#lookUp.add(id);
    }
    this.loadInstances();
  }

  /** The instances the list still lacks after a read, each asked alone: unknown to the API on a 404. */
  private async lookUpMissing(generation: number): Promise<void> {
    const ids = [...this.#lookUp].filter((id) => !this.#instances.has(id));
    this.#lookUp = new Set();
    const { client, ownerId, appId } = this;
    await Promise.all(
      ids.map(async (id) => {
        let found: LogInstance | null = null;
        if (this.#lookups < MAX_LOOKUPS) {
          this.#lookups += 1;
          try {
            const instance = await fetchInstance(client, ownerId, appId, id);
            found = instance == null ? null : fromApi(instance);
          } catch {
            // Shown as unknown: its lines are all there is.
          }
        }
        if (generation === this.#instancesGeneration && !this.#instances.has(id)) {
          this.#instances.set(id, found ?? unknownInstance(id, this.lineDeployment(id)));
        }
      }),
    );
    if (generation === this.#instancesGeneration && ids.length > 0) {
      this.#hues = assignHues(this.#hues, byCreation(this.#instances.values()), appId);
      this.requestUpdate();
      void this.readMissingDeployments(generation);
    }
  }

  /** The deployment a runtime line of this instance names, empty when none does. */
  private lineDeployment(instanceId: string): string {
    const line = this.allLines.find((log) => log.instanceId === instanceId && !isAccessLog(log));
    return line == null || isAccessLog(line) ? '' : line.deploymentId;
  }

  /** The deployments older than the last 20, read one by one, once each. */
  private async readMissingDeployments(generation: number): Promise<void> {
    const { client, ownerId, appId } = this;
    const ids = [...new Set([...this.#instances.values()].map((instance) => instance.deploymentId))].filter(
      (id) => id !== '' && !this.#deployments.has(id) && !this.#deploymentsAsked.has(id),
    );
    for (const id of ids) {
      this.#deploymentsAsked.add(id);
    }
    const read = await Promise.all(ids.map((id) => fetchDeployment(client, ownerId, appId, id).catch(() => null)));
    if (generation !== this.#instancesGeneration) {
      return;
    }
    for (const deployment of read) {
      if (deployment != null) {
        this.#deployments.set(deployment.id, deployment);
      }
    }
    if (read.some((deployment) => deployment != null)) {
      this.requestUpdate();
    }
  }

  /** How many lines each instance wrote, among the lines kept. */
  private get lineCounts(): Map<string, number> {
    const lines = this.allLines;
    if (this.#counts.lines !== lines) {
      this.#counts = { lines, counts: countLines(lines) };
    }
    return this.#counts.counts;
  }

  /** The selection, written in the address so a reload or a shared link keeps it. */
  private setSelection(selection: ReadonlySet<string>): void {
    if (selection === this.selection) {
      return;
    }
    this.selection = selection;
    writeHashParams({ instances: selectionParam(selection) });
  }

  private toggleInstance(id: string, on: boolean): void {
    const next = new Set(this.selection);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.setSelection(next);
  }

  private toggleInstancesPanel(): void {
    this.instancesOpen = !this.instancesOpen;
    try {
      localStorage.setItem(INSTANCES_KEY, this.instancesOpen ? 'open' : 'closed');
    } catch {
      // Not essential.
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

  /** The lines of the instances selected, if any, that hold the text of the filter, if any. */
  private get visibleLines(): LogLine[] {
    const lines = this.allLines;
    const needle = this.filter.trim().toLowerCase();
    const selection = this.selection;
    if (needle === '' && selection.size === 0) {
      return lines;
    }
    return lines.filter((log) => inSelection(selection, log) && (needle === '' || searchText(log).includes(needle)));
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
    const counts = this.lineCounts;
    // A colour per instance on each line, once several write.
    const marked = counts.size >= 2;
    if (marked && [...counts.keys()].some((id) => !this.#hues.has(id))) {
      this.#hues = assignHues(this.#hues, counts.keys(), this.appId);
    }
    const instanceCount = this.#instances.size;
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
          <button
            type="button"
            class="ghost with-icon instances-toggle ${this.selection.size > 0 ? 'filtering' : ''}"
            aria-expanded=${this.instancesOpen}
            aria-controls="instances"
            title=${this.instancesOpen ? t('logs.instances.hide') : t('logs.instances.show')}
            @click=${this.toggleInstancesPanel}
          >
            ${this.instancesOpen ? ICON_EYE : ICON_EYE_OFF}
            ${
              !this.instancesLoaded
                ? t('logs.instances.title')
                : this.selection.size > 0
                  ? t('logs.instances.toggleSelected', { selected: this.selection.size, count: instanceCount })
                  : t('logs.instances.toggle', { count: instanceCount })
            }
          </button>
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
      <div class="body">
        ${this.instancesOpen ? this.renderInstances(counts) : nothing}
        <div class="lines card ${mode}" role="log" aria-live="off">
          ${
            visible.length === 0
              ? html`<p class="empty">${this.emptyMessage()}</p>`
              : repeat(
                  visible,
                  (log) => `${isAccessLog(log) ? 'access' : 'app'}/${log.id}`,
                  (log) => {
                    const kind: LogKind = isAccessLog(log) ? 'access' : 'app';
                    const hue = this.#hues.get(log.instanceId);
                    const options = {
                      lead: both ? this.renderKind(kind) : nothing,
                      tint: both ? hueTint(KIND_HUES.get(kind) ?? 0) : null,
                      mark: marked && hue != null ? hueColor(hue) : null,
                      source: this.instanceTitle(log.instanceId),
                    };
                    return isAccessLog(log) ? this.renderAccessLine(log, options) : renderRuntimeLine(log, options);
                  },
                )
          }
        </div>
      </div>
    `;
  }

  /**
   * The instances of the window by deployment, each with its colour, its state and its lines;
   * ticking some keeps their lines only. Above them, the command that lists them.
   */
  private renderInstances(counts: ReadonlyMap<string, number>) {
    const command = instancesCommand(
      this.appId,
      this.deploymentId === '' ? { since: this.since } : { deploymentId: this.deploymentId },
    );
    const groups = groupInstances(this.#instances.values(), this.#deployments);
    const scope =
      this.deploymentId === '' ? (SCOPES[this.since] ?? 'logs.instances.scope.15m') : 'logs.instances.scope.deployment';
    const more =
      this.instancesLoaded && this.instancesError == null ? unlisted(this.#wider, this.#instances).length : 0;
    return html`<aside id="instances" class="instances card" aria-label=${t('logs.instances.title')}>
      <div class="menu-head">
        <strong>${t('logs.instances.title')}</strong>
        ${
          this.selection.size > 0
            ? html`<button type="button" class="link" @click=${() => this.setSelection(new Set())}>
                ${t('logs.instances.all')}
              </button>`
            : nothing
        }
      </div>
      <div class="scope small">
        <span class="muted">${t(scope)}</span>
        ${
          more > 0
            ? html`<span class="wider">
                ${t('logs.instances.wider', { count: more })}
                <button type="button" class="link" @click=${this.widen}>${t('logs.instances.widen')}</button>
              </span>`
            : nothing
        }
      </div>
      <cvc-cli command=${command}></cvc-cli>
      ${
        !this.instancesLoaded
          ? html`<p class="muted small">${t('logs.instances.loading')}</p>`
          : this.instancesError != null
            ? html`<p class="danger small">${this.instancesError}</p>`
            : groups.length === 0
              ? html`<p class="muted small">${t('logs.instances.none')}</p>`
              : groups.map((group) => this.renderGroup(group, counts))
      }
      <p class="muted small note">${t('logs.instances.note')}</p>
    </aside>`;
  }

  /** A deployment: its number (a link to its logs), its state, when and which commit; then its instances. */
  private renderGroup(group: InstanceGroup, counts: ReadonlyMap<string, number>) {
    const { deployment, deploymentId } = group;
    const title =
      deploymentId === ''
        ? t('logs.instances.noDeployment')
        : deployment == null
          ? t('logs.instances.deploymentAny')
          : t('logs.instances.deployment', { index: deployment.index });
    const state = deployment == null ? null : stateLabel(DEPLOYMENT_STATE_LABELS, deployment.state);
    const facts =
      deployment == null ? [] : [formatRelative(deployment.date), deployment.commit?.slice(0, 7) ?? ''].filter(Boolean);
    const link =
      deploymentId === '' || deploymentId === this.deploymentId
        ? null
        : withHashParams(window.location.hash, { deployment: deploymentId, instances: null });
    return html`<section class="group">
      <div class="group-head">
        ${
          link == null
            ? html`<strong title=${deploymentId}>${title}</strong>`
            : html`<a href=${link} title=${t('logs.instances.deploymentLogs')}>${title}</a>`
        }
        ${state == null ? nothing : html`<span class="badge ${state.tone}">${state.label}</span>`}
      </div>
      ${
        facts.length === 0
          ? nothing
          : html`<div class="muted small" title=${deployment == null ? '' : formatDateTime(deployment.date)}>
              ${facts.join(' · ')}
            </div>`
      }
      <ul>
        ${group.instances.map((instance) => this.renderInstance(instance, counts.get(instance.id) ?? 0))}
      </ul>
    </section>`;
  }

  /** One instance: its box, its colour, its name and number, its lines, and its state below. */
  private renderInstance(instance: LogInstance, count: number) {
    const hue = this.#hues.get(instance.id);
    const state = instanceState(instance);
    const details = [
      instance.id,
      instance.flavor ?? '',
      instance.createdAt == null ? '' : formatDateTime(instance.createdAt),
    ]
      .filter(Boolean)
      .join(' · ');
    return html`<li class=${count === 0 ? 'silent' : ''}>
      <label title=${details}>
        <input
          type="checkbox"
          .checked=${this.selection.has(instance.id)}
          @change=${(event: Event) => this.toggleInstance(instance.id, (event.currentTarget as HTMLInputElement).checked)}
        />
        <span class="swatch" ${inlineStyle({ background: hue == null ? null : hueColor(hue) })}></span>
        <span class="name">${instanceName(instance)}</span>
        <span class="number">${instanceNumber(instance)}</span>
        <span class="count" title=${t('logs.instances.lines', { count })}>${count}</span>
        <span class="state ${state.tone}">${state.label}</span>
      </label>
    </li>`;
  }

  /** The tooltip of a line's service: the instance that wrote it, in words. */
  private instanceTitle(id: string): string {
    const instance = this.#instances.get(id);
    if (instance == null) {
      return id;
    }
    return [instanceName(instance), instanceNumber(instance), id].filter(Boolean).join(' · ');
  }

  /**
   * One request: time, status, method, path, duration, bytes sent, client address. The host the
   * API reports is the Clever Cloud load balancer, not the requested domain: it stays in the title.
   */
  private renderAccessLine(log: ApplicationAccessLog, options: RuntimeLineOptions = {}) {
    const { lead = nothing, tint = null, mark = null, source = log.instanceId } = options;
    const { request, response } = log.detail;
    const place = [log.source.city, log.source.countryCode].filter((part) => part !== '' && part != null).join(', ');
    return html`<div
      class="line access s${Math.floor(response.statusCode / 100)}xx ${mark == null ? '' : 'marked'}"
      title=${source}
      ${inlineStyle({ background: tint, '--cvc-mark': mark })}
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
    const back = withHashParams(window.location.hash, { deployment: null, instances: null });
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
      /* The controls take what the line leaves: room for the filter to grow. */
      .toolbar > .row:last-child {
        flex: 1 1 auto;
      }
      .grow {
        flex: 1;
      }
      .error.small {
        margin-bottom: 0.5rem;
      }
      /* The instances on the left of the lines; above them in a narrow view. */
      :host {
        container-type: inline-size;
      }
      .body {
        display: flex;
        gap: 0.6rem;
        flex: 1;
        min-height: 0;
      }
      .lines {
        flex: 1;
        min-width: 0;
        min-height: 300px;
      }
      .instances-toggle.filtering {
        color: var(--cvc-accent);
        border-color: var(--cvc-accent);
      }
      .instances {
        flex: 0 0 17rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        overflow: auto;
        padding: 0.6rem 0.75rem;
        font-size: 0.85rem;
      }
      .instances cvc-cli {
        max-width: 100%;
      }
      .instances .scope {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        margin-top: -0.4rem;
      }
      .instances .group {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--cvc-border);
      }
      .instances .group-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
      }
      .instances ul {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        margin: 0.2rem 0 0;
        padding: 0;
        list-style: none;
      }
      .instances label {
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr) auto auto;
        align-items: center;
        column-gap: 0.4rem;
        padding: 0.15rem 0.3rem;
        border-radius: 4px;
        cursor: pointer;
      }
      .instances label:hover {
        background: color-mix(in srgb, var(--cvc-text) 6%, transparent);
      }
      .instances input {
        margin: 0;
      }
      .instances .swatch {
        width: 0.7rem;
        height: 0.7rem;
        border-radius: 2px;
        background: var(--cvc-muted);
      }
      .instances .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .instances .number,
      .instances .count {
        color: var(--cvc-muted);
        font-size: 0.8rem;
        font-variant-numeric: tabular-nums;
      }
      .instances .count {
        min-width: 3ch;
        text-align: right;
      }
      .instances .state {
        grid-column: 3 / -1;
        color: var(--cvc-muted);
        font-size: 0.78rem;
      }
      .instances .state.ok {
        color: var(--cvc-ok);
      }
      .instances .state.warn {
        color: var(--cvc-warn);
      }
      .instances .state.danger {
        color: var(--cvc-danger);
      }
      .instances li.silent .name {
        color: var(--cvc-muted);
      }
      .instances p {
        margin: 0;
      }
      .instances .note {
        margin-top: auto;
      }
      @container (max-width: 700px) {
        .body {
          flex-direction: column;
        }
        .instances {
          flex: none;
          max-height: 14rem;
        }
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

function readInstancesOpen(): boolean {
  try {
    return localStorage.getItem(INSTANCES_KEY) !== 'closed';
  } catch {
    return true;
  }
}

/** Its name, or the start of its id when it has none (an instance the API does not know). */
function instanceName(instance: LogInstance): string {
  return instance.name ?? instance.id.slice(0, 8);
}

/** "build", or its number in its deployment: `#0`. */
function instanceNumber(instance: LogInstance): string {
  if (instance.isBuildVm) {
    return t('logs.instances.build');
  }
  return instance.index == null ? '' : `#${instance.index}`;
}

/** Its state in words; for a deleted one, when. */
function instanceState(instance: LogInstance): StateLabel {
  if (instance.state == null) {
    return { label: t('logs.instances.unknown'), tone: 'neutral' };
  }
  if (instance.state === 'DELETED' && instance.deletedAt != null) {
    return { label: t('logs.instances.deletedAt', { time: formatTime(instance.deletedAt) }), tone: 'neutral' };
  }
  return stateLabel(INSTANCE_STATE_LABELS, instance.state);
}

/** The start of a replay window: its instances are those alive since then. */
function windowStart(since: string): Date {
  return new Date(Date.now() - sinceMinutes(since) * 60_000);
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
