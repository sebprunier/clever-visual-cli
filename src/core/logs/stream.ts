/**
 * One live log stream (`clever logs`, `clever accesslogs`): its status, the
 * client's reconnections, and a capped buffer of lines filled once per
 * animation frame. The single-application tab and the multi-application page
 * consume the same thing. Emits `change`.
 */
import type { LogsStream } from '../../data/api.js';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'paused' | 'closed' | 'error';

export interface LogLineBase {
  id: string;
  date: string;
}

/** Opens the stream from a date; the caller binds the client, organisation and application. */
export type LogOpener<T> = (since: Date) => Promise<LogsStream<T>>;

/** Lines kept per stream; the oldest go first. */
export const MAX_LINES = 2000;

export class LogStream<T extends LogLineBase> extends EventTarget {
  status: StreamStatus = 'idle';
  error: string | null = null;
  /** Reconnections the client made since the stream opened. */
  retries = 0;
  lines: T[] = [];
  /** Bumped whenever `lines` changes, for views that derive from it. */
  version = 0;

  readonly #open: LogOpener<T>;
  #stream: LogsStream<T> | null = null;
  #pending: T[] = [];
  #flushScheduled = false;
  #generation = 0;

  constructor(open: LogOpener<T>) {
    super();
    this.#open = open;
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
    try {
      const since = minutesBack > 0 ? new Date(Date.now() - minutesBack * 60_000) : new Date();
      const stream = await this.#open(since);
      if (generation !== this.#generation) {
        stream.close();
        return;
      }
      stream
        .onOpen(() => {
          this.status = 'open';
          this.#emit();
        })
        .onLog((log) => this.#enqueue(log))
        .onError((error) => {
          this.error = error.message;
          this.retries = stream.retryCount;
          this.#emit();
        });
      this.#stream = stream;
      void stream.start().then(() => {
        if (this.#stream === stream) {
          this.#stream = null;
          this.status = 'closed';
          this.#emit();
        }
      });
    } catch (error) {
      if (generation === this.#generation) {
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
        this.#emit();
      }
    }
  }

  stop(): void {
    this.#generation += 1;
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
    this.lines = lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
    this.version += 1;
    this.#emit();
  }

  #emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}
