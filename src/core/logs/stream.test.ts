import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogsStream } from '../../data/api.js';
import { t } from '../i18n.js';
import { LogStream, OPEN_ATTEMPTS, OPEN_TIMEOUT_MS } from './stream.js';

interface Line {
  id: string;
  date: string;
}

/** A stream of the client that opens, ends or fails only when told to. */
class FakeStream {
  retryCount = 0;
  closed = false;
  #onOpen: () => void = () => {};
  #end: (reason: unknown) => void = () => {};
  #fail: (error: unknown) => void = () => {};

  onOpen(callback: () => void): this {
    this.#onOpen = callback;
    return this;
  }
  onLog(): this {
    return this;
  }
  onError(): this {
    return this;
  }
  start(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.#end = resolve;
      this.#fail = reject;
    });
  }
  close(): void {
    this.closed = true;
    this.#end({ type: 'CLOSED' });
  }
  pause(): void {}
  resume(): void {}
  open(): void {
    this.#onOpen();
  }
  fail(error: Error): void {
    this.#fail(error);
  }
}

/** A log stream on fake client streams, with what it asked for. */
function setUp() {
  const streams: FakeStream[] = [];
  const sinces: Date[] = [];
  const log = new LogStream<Line>(async (since) => {
    const stream = new FakeStream();
    streams.push(stream);
    sinces.push(since);
    return stream as unknown as LogsStream<Line>;
  });
  return { log, streams, sinces };
}

describe('the opening of a log stream (#39)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens it again over the same window when it does not open in time, then gives up', async () => {
    const { log, streams, sinces } = setUp();
    await log.start(15);
    expect(streams).toHaveLength(1);
    expect(log.status).toBe('connecting');

    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
    expect(streams[0].closed).toBe(true);
    expect(streams).toHaveLength(2);
    expect(log.status).toBe('connecting');
    expect(log.error).toBe(t('logs.noAnswer'));
    expect(log.retries).toBe(1);
    expect(sinces[1]).toEqual(sinces[0]);

    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
    expect(streams).toHaveLength(OPEN_ATTEMPTS);
    expect(log.retries).toBe(2);

    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
    expect(streams[2].closed).toBe(true);
    expect(log.status).toBe('error');
    expect(log.error).toBe(t('logs.noAnswerGaveUp', { count: OPEN_ATTEMPTS }));
    expect(log.running).toBe(false);

    await vi.advanceTimersByTimeAsync(5 * OPEN_TIMEOUT_MS);
    expect(streams).toHaveLength(OPEN_ATTEMPTS);
  });

  it('keeps the attempt that opens, and says nothing of the one before', async () => {
    const { log, streams } = setUp();
    await log.start(15);
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
    streams[1].open();
    expect(log.status).toBe('open');
    expect(log.error).toBeNull();
    expect(log.retries).toBe(0);

    await vi.advanceTimersByTimeAsync(5 * OPEN_TIMEOUT_MS);
    expect(streams).toHaveLength(2);
    expect(streams[1].closed).toBe(false);
    expect(log.running).toBe(true);
  });

  it('tries nothing more once stopped, or started again', async () => {
    const { log, streams } = setUp();
    await log.start(15);
    log.stop();
    await vi.advanceTimersByTimeAsync(5 * OPEN_TIMEOUT_MS);
    expect(streams).toHaveLength(1);

    // Started again just before the timeout of the first start: a new count of attempts.
    await log.start(15);
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS - 1);
    expect(streams).toHaveLength(2);
    expect(log.error).toBeNull();
  });

  it('drops an attempt that comes after the next one started', async () => {
    const streams: FakeStream[] = [];
    let release: () => void = () => {};
    const log = new LogStream<Line>(() => {
      const stream = new FakeStream();
      streams.push(stream);
      // The first opening hangs before the client even has a stream.
      if (streams.length === 1) {
        return new Promise((resolve) => {
          release = () => resolve(stream as unknown as LogsStream<Line>);
        });
      }
      return Promise.resolve(stream as unknown as LogsStream<Line>);
    });
    void log.start(15);
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
    expect(streams).toHaveLength(2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(streams[0].closed).toBe(true);
    streams[1].open();
    expect(log.status).toBe('open');
  });

  it('says why when the client gives up on an error', async () => {
    const { log, streams } = setUp();
    await log.start(15);
    streams[0].open();
    streams[0].fail(new Error('Forbidden'));
    await vi.advanceTimersByTimeAsync(0);
    expect(log.status).toBe('error');
    expect(log.error).toBe('Forbidden');
    expect(log.running).toBe(false);
  });
});
