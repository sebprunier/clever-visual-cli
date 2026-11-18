/**
 * One live log stream (`clever logs`, `clever accesslogs`): its status, the
 * client's reconnections, and a capped buffer of lines filled once per
 * animation frame. The single-application tab and the multi-application page
 * consume the same thing. Emits `change`.
 */
import type { LogsStream } from '../../data/api.js';
import { t } from '../i18n.js';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'paused' | 'closed' | 'error';

export interface LogLineBase {
  id: string;
  date: string;
}

/** Opens the stream from a date; the caller binds the client, organisation and application. */
export type LogOpener<T> = (since: Date) => Promise<LogsStream<T>>;

/** Lines kept per stream by default; the oldest go first. */
export const MAX_LINES = 2000;

/**
 * A stream not open this long after it started is opened again (#39): the API sometimes never
 * answers an opening, and the client waits for good.
 */
export const OPEN_TIMEOUT_MS = 10_000;
/** Openings tried before giving up. */
export const OPEN_ATTEMPTS = 3;

export class LogStream<T extends LogLineBase> extends EventTarget {
  status: StreamStatus = 'idle';
  error: string | null = null;
  /** Reconnections the client made since the stream opened. */
  retries = 0;
  lines: T[] = [];
  /** Bumped whenever `lines` changes, for views that derive from it. */
  version = 0;

  readonly #open: LogOpener<T>;
  readonly #maxLines: number;
  #stream: LogsStream<T> | null = null;
  #pending: T[] = [];
  #flushScheduled = false;
  #generation = 0;
  /** Bumped at each attempt at opening: an attempt overtaken by the next one is dropped. */
  #attempt = 0;
  /** Whether the stream of the current attempt opened; until then, the timer may open it again. */
  #opened = false;
  #openTimer: ReturnType<typeof setTimeout> | undefined;

  /** `maxLines`: more for a busy kind of logs, such as the access logs. */
  constructor(open: LogOpener<T>, maxLines = MAX_LINES) {
    super();
    this.#open = open;
    this.#maxLines = maxLines;
  }

  get running(): boolean {
    return this.#stream != null;
  }

  /** (Re)opens the stream, replaying the last `minutesBack` minutes. */
  async start(minutesBack: number): Promise<void> {
    this.stop();
    const generation = ++this.#generation;
    this.status = 'connecting';
    this.error = null;
    this.retries = 0;
    this.#emit();
    const since = minutesBack > 0 ? new Date(Date.now() - minutesBack * 60_000) : new Date();
    await this.#connect(since, 1, generation);
  }

  /** One attempt at opening the stream over the window from `since`; the timer may start the next one. */
  async #connect(since: Date, attempt: number, generation: number): Promise<void> {
    const id = ++this.#attempt;
    this.#opened = false;
    this.#watchOpening(since, attempt, generation);
    try {
      const stream = await this.#open(since);
      if (generation !== this.#generation || id !== this.#attempt) {
        stream.close();
        return;
      }
      stream
        .onOpen(() => {
          // Opened, or reopened after a lost connection: an error from before no longer holds.
          this.#opened = true;
          clearTimeout(this.#openTimer);
          this.status = 'open';
          this.error = null;
          this.retries = 0;
          this.#emit();
        })
        .onLog((log) => this.#enqueue(log))
        .onError((error) => {
          this.error = error.message;
          this.retries = stream.retryCount;
          this.#emit();
        });
      this.#stream = stream;
      // Running again: the views show the stop button, not the start one.
      this.#emit();
      void stream.start().then(
        () => this.#ended(stream, null),
        (error: unknown) => this.#ended(stream, error),
      );
    } catch (error) {
      if (generation === this.#generation && id === this.#attempt) {
        clearTimeout(this.#openTimer);
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
        this.#emit();
      }
    }
  }

  /**
   * Opens the stream again if it is not open in time, over the same window: nothing came, so no
   * line comes twice. After the last attempt, it gives up and says so; starting it opens it again.
   */
  #watchOpening(since: Date, attempt: number, generation: number): void {
    clearTimeout(this.#openTimer);
    this.#openTimer = setTimeout(() => {
      if (generation !== this.#generation || this.#opened) {
        return;
      }
      if (this.status === 'paused') {
        // Paused while connecting: the time starts again once resumed.
        this.#watchOpening(since, attempt, generation);
        return;
      }
      const stream = this.#stream;
      this.#stream = null;
      stream?.close();
      if (attempt < OPEN_ATTEMPTS) {
        this.error = t('logs.noAnswer');
        this.retries = attempt;
        this.#emit();
        void this.#connect(since, attempt + 1, generation);
      } else {
        this.status = 'error';
        this.error = t('logs.noAnswerGaveUp', { count: OPEN_ATTEMPTS });
        this.retries = 0;
        this.#emit();
      }
    }, OPEN_TIMEOUT_MS);
  }

  /** The stream ended: by itself (`error` null), or the client gave up on an error. */
  #ended(stream: LogsStream<T>, error: unknown): void {
    if (this.#stream !== stream) {
      return;
    }
    this.#stream = null;
    clearTimeout(this.#openTimer);
    if (error == null) {
      this.status = 'closed';
    } else {
      this.status = 'error';
      this.error = error instanceof Error ? error.message : String(error);
    }
    this.#emit();
  }

  stop(): void {
    this.#generation += 1;
    clearTimeout(this.#openTimer);
    if (this.#stream != null) {
      this.#stream.close();
      this.#stream = null;
      this.status = 'closed';
      this.#emit();
    }
  }

  pause(): void {
    if (this.#stream != null && this.status !== 'paused') {
      this.#stream.pause();
      this.status = 'paused';
      this.#emit();
    }
  }

  resume(): void {
    if (this.#stream != null && this.status === 'paused') {
      this.#stream.resume();
      this.status = 'open';
      this.#emit();
    }
  }

  togglePause(): void {
    if (this.status === 'paused') {
      this.resume();
    } else {
      this.pause();
    }
  }

  clear(): void {
    this.lines = [];
    this.#pending = [];
    this.version += 1;
    this.#emit();
  }

  #enqueue(line: T): void {
    this.#pending.push(line);
    if (!this.#flushScheduled) {
      this.#flushScheduled = true;
      requestAnimationFrame(() => this.#flush());
    }
  }

  #flush(): void {
    this.#flushScheduled = false;
    if (this.#pending.length === 0) {
      return;
    }
    const lines = [...this.lines, ...this.#pending];
    this.#pending = [];
    this.lines = lines.length > this.#maxLines ? lines.slice(lines.length - this.#maxLines) : lines;
    this.version += 1;
    this.#emit();
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}
