import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogsStream } from '../../data/api.js';
import { t } from '../i18n.js';
import { FIRST_SLICE_MS, LIVE_OVERLAP_MS, lineKey, LogStream, OPEN_ATTEMPTS, OPEN_TIMEOUT_MS } from './stream.js';

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

// The window "now" in these tests: no past to read (#40), the live stream only.
describe('the opening of a log stream (#39)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens it again over the same window when it does not open in time, then gives up', async () => {
    const { log, streams, sinces } = setUp();
    await log.start(0);
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
    await log.start(0);
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
    await log.start(0);
    log.stop();
    await vi.advanceTimersByTimeAsync(5 * OPEN_TIMEOUT_MS);
    expect(streams).toHaveLength(1);

    // Started again just before the timeout of the first start: a new count of attempts.
    await log.start(0);
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
    void log.start(0);
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
    await log.start(0);
    streams[0].open();
    streams[0].fail(new Error('Forbidden'));
    await vi.advanceTimersByTimeAsync(0);
    expect(log.status).toBe('error');
    expect(log.error).toBe('Forbidden');
    expect(log.running).toBe(false);
  });
});

/**
 * A stream served from a list of dated lines, a moment after it starts: those since its start,
 * then, for a slice, those up to its end included, and it ends.
 */
class ServedStream {
  retryCount = 0;
  closed = false;
  readonly #lines: Line[];
  readonly #ends: boolean;
  #onOpen: () => void = () => {};
  #onLog: (line: Line) => void = () => {};
  #end: (reason: unknown) => void = () => {};

  constructor(lines: Line[], ends: boolean) {
    this.#lines = lines;
    this.#ends = ends;
  }
  onOpen(callback: () => void): this {
    this.#onOpen = callback;
    return this;
  }
  onLog(callback: (line: Line) => void): this {
    this.#onLog = callback;
    return this;
  }
  onError(): this {
    return this;
  }
  start(): Promise<unknown> {
    return new Promise((resolve) => {
      this.#end = resolve;
      setTimeout(() => {
        if (this.closed) {
          return;
        }
        this.#onOpen();
        this.#lines.forEach((line) => this.#onLog(line));
        if (this.#ends) {
          resolve({ type: 'UNTIL_REACHED' });
        }
      }, 100);
    });
  }
  close(): void {
    this.closed = true;
    this.#end({ type: 'CLOSED' });
  }
  pause(): void {}
  resume(): void {}
}

const NOW = Date.parse('2026-11-18T10:00:00.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** A line every 30 s over the last two hours, the newest 30 s ago, but those of `quiet`. */
function dayOfLines(quiet: (ago: number) => boolean = () => false): Line[] {
  const lines: Line[] = [];
  for (let ago = 240 * 30 * SECOND; ago >= 30 * SECOND; ago -= 30 * SECOND) {
    if (!quiet(ago)) {
      lines.push({ id: `line-${ago / SECOND}`, date: new Date(NOW - ago).toISOString() });
    }
  }
  return lines;
}

/** A log server on `lines`: the openings asked for, slices failing if told to. */
function serve(lines: Line[], { failSlices = false } = {}) {
  const asked: Array<{ since: number; until: number | null }> = [];
  const open = async (since: Date, until?: Date) => {
    asked.push({ since: since.getTime(), until: until?.getTime() ?? null });
    if (until != null && failSlices) {
      throw new Error('Bad gateway');
    }
    const served = lines.filter(
      (line) => Date.parse(line.date) >= since.getTime() && (until == null || Date.parse(line.date) <= until.getTime()),
    );
    return new ServedStream(served, until != null) as unknown as LogsStream<Line>;
  };
  const slices = () => asked.filter((call) => call.until != null);
  return { open, asked, slices };
}

const dates = (log: LogStream<Line>) => log.lines.map((line) => line.date);

describe('the past of a log stream, read backwards (#40)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('goes live first, then reads the past newest first, each slice above the lines there', async () => {
    const server = serve(dayOfLines());
    const log = new LogStream<Line>(server.open);
    await log.start(60);
    expect(server.asked[0]).toEqual({ since: NOW - LIVE_OVERLAP_MS, until: null });
    expect(log.history).toBe('loading');

    await vi.advanceTimersByTimeAsync(10 * SECOND);
    // The last hour, one line every 30 s from 60 minutes ago to 30 s ago: 120 lines, in order, each once.
    expect(log.lines).toHaveLength(120);
    expect(dates(log)).toEqual([...dates(log)].sort());
    expect(new Set(log.lines.map((line) => line.id)).size).toBe(120);
    expect(log.history).toBe('complete');

    // Newest first, each slice ending where the one before started, growing 4 times at most.
    const slices = server.slices();
    expect(slices[0]).toEqual({ since: NOW - LIVE_OVERLAP_MS - FIRST_SLICE_MS, until: NOW - LIVE_OVERLAP_MS });
    slices.slice(1).forEach((slice, index) => expect(slice.until).toBe(slices[index].since));
    expect(slices.map((slice) => (slice.until! - slice.since) / MINUTE).slice(0, 3)).toEqual([1, 4, 16]);
    expect(slices.at(-1)!.since).toBe(NOW - 60 * MINUTE);
  });

  it('stops at the most lines kept, and says the window was cut', async () => {
    const server = serve(dayOfLines());
    const log = new LogStream<Line>(server.open, 50);
    await log.start(120);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(log.lines).toHaveLength(50);
    // The newest 50: from 25 minutes ago to 30 s ago.
    expect(log.lines[0].date).toBe(new Date(NOW - 25 * MINUTE).toISOString());
    expect(log.lines.at(-1)!.date).toBe(new Date(NOW - 30 * SECOND).toISOString());
    expect(log.history).toBe('cut');
    // Nothing asked for beyond the slice that filled the view.
    expect(server.slices().at(-1)!.since).toBeGreaterThan(NOW - 120 * MINUTE);
  });

  it('makes a slice twice as long after an empty one', async () => {
    // Nothing written in the last 20 minutes.
    const server = serve(dayOfLines((ago) => ago < 20 * MINUTE));
    const log = new LogStream<Line>(server.open);
    await log.start(60);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    const durations = server.slices().map((slice) => (slice.until! - slice.since) / MINUTE);
    expect(durations.slice(0, 4)).toEqual([1, 2, 4, 8]);
    expect(log.history).toBe('complete');
  });

  it('keeps once a line at the edge of two windows, both ends being inclusive', async () => {
    // One at the start of the live stream, one where the first slice starts.
    const edges = [
      { id: 'live-edge', date: new Date(NOW - LIVE_OVERLAP_MS).toISOString() },
      { id: 'slice-edge', date: new Date(NOW - LIVE_OVERLAP_MS - FIRST_SLICE_MS).toISOString() },
    ];
    const server = serve([...dayOfLines(), ...edges].sort((a, b) => a.date.localeCompare(b.date)));
    const log = new LogStream<Line>(server.open);
    await log.start(15);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(log.lines.filter((line) => line.id === 'live-edge')).toHaveLength(1);
    expect(log.lines.filter((line) => line.id === 'slice-edge')).toHaveLength(1);
  });

  it('keeps every line that shares its id with another, as the API gives them', async () => {
    // The API's ids are not unique: here every line has one of two.
    const lines = dayOfLines().map((line, index) => ({ ...line, id: `303804721:${index % 2}:0` }));
    const server = serve(lines);
    const log = new LogStream<Line>(server.open);
    await log.start(60);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(log.lines).toHaveLength(120);
  });

  it('drops the past of a start that is no longer the current one', async () => {
    const server = serve(dayOfLines());
    const log = new LogStream<Line>(server.open);
    await log.start(120);
    await vi.advanceTimersByTimeAsync(150);
    await log.start(15);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(log.lines[0].date >= new Date(NOW - 15 * MINUTE).toISOString()).toBe(true);
    expect(log.history).toBe('complete');
  });

  it('reads no more of the past once cleared', async () => {
    const server = serve(dayOfLines());
    const log = new LogStream<Line>(server.open);
    await log.start(120);
    await vi.advanceTimersByTimeAsync(150);
    log.clear();
    const asked = server.slices().length;
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(log.lines).toHaveLength(0);
    expect(log.history).toBe('none');
    expect(server.slices()).toHaveLength(asked);
  });

  it('says when the past cannot be read, the live lines staying', async () => {
    const server = serve(dayOfLines(), { failSlices: true });
    const log = new LogStream<Line>(server.open);
    await log.start(60);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(log.history).toBe('error');
    expect(log.historyError).toBe('Bad gateway');
    expect(log.status).toBe('open');
  });

  it('reads no past for "now"', async () => {
    const server = serve(dayOfLines());
    const log = new LogStream<Line>(server.open);
    await log.start(0);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(server.asked).toHaveLength(1);
    expect(log.history).toBe('none');
  });
});

describe('the key of a log line', () => {
  it('is its own, though the API gives several lines the same id', () => {
    const first = { id: '303804721:1:0', date: '2026-11-17T13:25:26.519Z' };
    const second = { id: '303804721:1:0', date: '2026-11-17T13:26:26.519Z' };
    expect(lineKey(first)).not.toBe(lineKey(second));
    expect(lineKey(first)).toBe(lineKey(first));
  });
});
