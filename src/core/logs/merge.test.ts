import { describe, expect, it } from 'vitest';
import { distinctHues, hueColor, hueOf, hueTint, mergeLines } from './merge.js';

const line = (id: string, date: string) => ({ id, date });

describe('mergeLines', () => {
  it('interleaves the sources by date, late arrivals included', () => {
    const merged = mergeLines([
      { appId: 'a', lines: [line('a1', '2026-10-20T10:00:01Z'), line('a2', '2026-10-20T10:00:05Z')] },
      // b delivered its history after its live lines: still in place once merged.
      { appId: 'b', lines: [line('b2', '2026-10-20T10:00:04Z'), line('b1', '2026-10-20T10:00:02Z')] },
    ]);
    expect(merged.map((entry) => entry.line.id)).toEqual(['a1', 'b1', 'b2', 'a2']);
    expect(merged[1].appId).toBe('b');
  });

  it('keeps the order of the sources for equal dates, leaves hidden ones out, and caps from the oldest', () => {
    const sources = [
      { appId: 'a', lines: [line('a1', '2026-10-20T10:00:00Z')] },
      { appId: 'b', lines: [line('b1', '2026-10-20T10:00:00Z'), line('b2', '2026-10-20T10:00:09Z')] },
    ];
    expect(mergeLines(sources).map((entry) => entry.line.id)).toEqual(['a1', 'b1', 'b2']);
    expect(mergeLines(sources, new Set(['a'])).map((entry) => entry.line.id)).toEqual(['b1', 'b2']);
    expect(mergeLines(sources, new Set(), 2).map((entry) => entry.line.id)).toEqual(['b1', 'b2']);
  });
});

describe('application colours', () => {
  it('derive a hue from the id', () => {
    expect(hueOf('app_1')).toBe(hueOf('app_1'));
    expect(hueOf('app_5a9e4e15-429d-43ba-a608-6fb3876620e6')).toBeGreaterThanOrEqual(0);
    expect(hueOf('app_5a9e4e15-429d-43ba-a608-6fb3876620e6')).toBeLessThan(360);
    expect(hueColor(200)).toContain('200');
    expect(hueTint(200)).toContain('200');
  });

  it('keep the applications of a set far apart, whatever the order', () => {
    const ids = ['app_c', 'app_a', 'app_b', 'app_d', 'app_e', 'app_f', 'app_g'];
    const hues = distinctHues(ids);
    expect(distinctHues([...ids].reverse())).toEqual(hues);
    const values = [...hues.values()];
    for (const [i, a] of values.entries()) {
      for (const b of values.slice(i + 1)) {
        const gap = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
        expect(gap).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
