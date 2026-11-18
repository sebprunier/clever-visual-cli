/**
 * One live log stream (`clever logs`, `clever accesslogs`): its status, the
 * client's reconnections, and a capped buffer of lines filled once per
 * animation frame. The single-application tab and the multi-application page
 * consume the same thing. Emits `change`.
 *
 * The API replays a window at about 333 lines/s, oldest first, however the
 * client asks (#40). So the stream goes live from now, and the past of the
 * window is read backwards, slice by slice, newest first, each slice put above
 * the lines already there, until the view is full or the window is read: the
 * same lines as a replay would leave, without the long scroll through them.
 */
import type { LogsStream } from '../../data/api.js';
import { t } from '../i18n.js';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'paused' | 'closed' | 'error';

export interface LogLineBase {
  id: string;
  date: string;
}

/**
 * Opens the stream from a date, live, or up to `until`, a slice of the past that ends there; the
 * caller binds the client, organisation and application.
 */
export type LogOpener<T> = (since: Date, until?: Date) => Promise<LogsStream<T>>;

/**
 * Where the past read backwards stands (#40): nothing to read (`now`), being read, read to the
 * start of the window, cut by the most lines kept, or stopped by an error.
 */
export type HistoryState = 'none' | 'loading' | 'complete' | 'cut' | 'error';

/** Lines kept per stream by default; the oldest go first. */
export const MAX_LINES = 2000;

/**
 * A stream not open this long after it started is opened again (#39): the API sometimes never
 * answers an opening, and the client waits for good.
 */
export const OPEN_TIMEOUT_MS = 10_000;
/** Openings tried before giving up. */
export const OPEN_ATTEMPTS = 3;

/** The live stream starts this far before now: a line a little late to reach the log store is not lost. */
export const LIVE_OVERLAP_MS = 10_000;
/** The first slice of the past; each next one is sized from the lines per minute seen so far. */
export const FIRST_SLICE_MS = 60_000;
/** The most a slice grows from one to the next: a guess from a short slice may be far off. */
const SLICE_GROWTH = 4;
/**
 * Slices read at once, across every stream of the page: the browser opens six connections to the
 * API host at most, and the live streams must keep theirs.
 */
const SLICES_AT_ONCE = 2;

let slicesReading = 0;
const slicesWaiting: Array<() => void> = [];

/** Waits for a turn to read a slice; the function returned gives it back. */
async function sliceTurn(): Promise<() => void> {
  if (slicesReading >= SLICES_AT_ONCE) {
    await new Promise<void>((resolve) => slicesWaiting.push(resolve));
  }
  slicesReading += 1;
  return () => {
    slicesReading -= 1;
    slicesWaiting.shift()?.();
  };
}

export class LogStream<T extends LogLineBase> extends EventTarget {
  status: StreamStatus = 'idle';
  error: string | null = null;
  /** Reconnections the client made since the stream opened. */
  retries = 0;
  lines: T[] = [];
  /** Bumped whenever `lines` changes, for views that derive from it. */
  version = 0;
  /** The past of the window, read backwards (#40). */
  history: HistoryState = 'none';
  historyError: string | null = null;

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
  /** Bumped when the past being read no longer matters: a new start, a stop, a clear. */
  #history = 0;
  /** The slice being read, closed if its reading is cancelled. */
  #slice: LogsStream<T> | null = null;

  /** `maxLines`: more for a busy kind of logs, such as the access logs. */
  constructor(open: LogOpener<T>, maxLines = MAX_LINES) {
    super();
    this.#open = open;
    this.#maxLines = maxLines;
  }

  get running(): boolean {
    return this.#stream != null;
  }

  /**
   * (Re)opens the stream over the last `minutesBack` minutes: live from a few seconds ago, then the
   * rest of the window read backwards.
   */
  async start(minutesBack: number): Promise<void> {
    this.stop();
    const generation = ++this.#generation;
    this.status = 'connecting';
    this.error = null;
    this.retries = 0;
    this.history = 'none';
    this.historyError = null;
    this.#emit();
    const now = Date.now();
    if (minutesBack <= 0) {
      await this.#connect(new Date(now), 1, generation);
      return;
    }
    const windowStart = new Date(now - minutesBack * 60_000);
    const liveSince = new Date(Math.max(windowStart.getTime(), now - LIVE_OVERLAP_MS));
    const connecting = this.#connect(liveSince, 1, generation);
    void this.#readPast(windowStart, liveSince, ++this.#history);
    await connecting;
  }

  /**
   * The window before `until`, slice by slice, newest first, each put above the lines already
   * there. A slice is sized to bring about the lines still missing at the pace seen so far.
   */
  async #readPast(windowStart: Date, until: Date, history: number): Promise<void> {
    let end = until.getTime();
    let duration = FIRST_SLICE_MS;
    let spanRead = 0;
    let linesRead = 0;
    this.history = 'loading';
    this.#emit();
    try {
      while (end > windowStart.getTime()) {
        if (this.#room() <= 0) {
          break;
        }
        const since = Math.max(windowStart.getTime(), end - duration);
        const done = await sliceTurn();
        let slice: T[] | null;
        try {
          slice = await this.#readSlice(new Date(since), new Date(end), history);
        } finally {
          done();
        }
        if (slice == null) {
          return;
        }
        this.#prepend(slice);
        spanRead += end - since;
        linesRead += slice.length;
        end = since;
        const perMs = linesRead / spanRead;
        duration =
          perMs === 0
            ? duration * 2
            : Math.min(duration * SLICE_GROWTH, Math.max(FIRST_SLICE_MS, (this.#room() / perMs) * 1.2));
      }
      if (history === this.#history) {
        this.history = end > windowStart.getTime() ? 'cut' : 'complete';
        this.#emit();
      }
    } catch (error) {
      if (history === this.#history) {
        this.history = 'error';
        this.historyError = error instanceof Error ? error.message : String(error);
        this.#emit();
      }
    }
  }

  /** Lines the view can still take. */
  #room(): number {
    return this.#maxLines - this.lines.length - this.#pending.length;
  }

  /**
   * The lines of one slice of the past, once it ended; null if its reading was cancelled. A slice
   * that does not open in time is opened again, as the live stream is (#39).
   */
  async #readSlice(since: Date, until: Date, history: number): Promise<T[] | null> {
    for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt += 1) {
      if (history !== this.#history) {
        return null;
      }
      const stream = await this.#open(since, until);
      if (history !== this.#history) {
        stream.close();
        return null;
      }
      const lines: T[] = [];
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened) {
          stream.close();
        }
      }, OPEN_TIMEOUT_MS);
      stream
        .onOpen(() => {
          opened = true;
          clearTimeout(timer);
        })
        .onLog((line) => lines.push(line));
      this.#slice = stream;
      try {
        await stream.start();
      } finally {
        clearTimeout(timer);
        if (this.#slice === stream) {
          this.#slice = null;
        }
      }
      if (history !== this.#history) {
        return null;
      }
      if (opened) {
        return lines;
      }
    }
    throw new Error(t('logs.noAnswerGaveUp', { count: OPEN_ATTEMPTS }));
  }

  /** Lines older than those there, put above them, without the ones already there, up to the most kept. */
  #prepend(slice: T[]): void {
    const known = new Set([...this.lines, ...this.#pending].map((line) => line.id));
    const older = slice.filter((line) => !known.has(line.id));
    if (older.length === 0) {
      return;
    }
    const room = Math.max(0, this.#maxLines - this.lines.length - this.#pending.length);
    this.lines = [...older.slice(Math.max(0, older.length - room)), ...this.lines];
    this.version += 1;
    this.#emit();
  }

  /** The past no longer read: its slice closed, nothing more put above. */
  #stopHistory(): void {
    this.#history += 1;
    this.#slice?.close();
    this.#slice = null;
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
    if (this.history === 'loading') {
      this.history = 'none';
    }
    this.#stopHistory();
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
    this.#stopHistory();
    this.history = 'none';
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
