/**
 * The merged view of several applications' logs: their lines interleaved by
 * date, whatever order the streams delivered them in, and a stable colour
 * per application.
 */

export interface MergedLine<T> {
  appId: string;
  line: T;
}

/** Lines of every visible source, oldest first; equal dates keep the order of the sources, then of arrival. */
export function mergeLines<T extends { date: string }>(
  sources: ReadonlyArray<{ appId: string; lines: readonly T[] }>,
  hidden: ReadonlySet<string> = new Set(),
  max = Number.POSITIVE_INFINITY,
): MergedLine<T>[] {
  const keyed: Array<{ time: number; source: number; index: number; entry: MergedLine<T> }> = [];
  sources.forEach((source, sourceIndex) => {
    if (hidden.has(source.appId)) {
      return;
    }
    source.lines.forEach((line, index) => {
      keyed.push({ time: Date.parse(line.date), source: sourceIndex, index, entry: { appId: source.appId, line } });
    });
  });
  keyed.sort((a, b) => a.time - b.time || a.source - b.source || a.index - b.index);
  const merged = keyed.map((item) => item.entry);
  return merged.length > max ? merged.slice(merged.length - max) : merged;
}

/** A hue from 0 to 359 derived from the application id (FNV-1a). */
export function hueOf(appId: string): number {
  let hash = 0x811c9dc5;
  for (const char of appId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

const GOLDEN_ANGLE = 137.508;

/**
 * One hue per application of a set, as far apart as possible: the golden angle from a start
 * derived from the set, in the order of the ids. The same set always gets the same colours,
 * whatever order it was given in, and two applications of it never look alike.
 */
export function distinctHues(appIds: readonly string[]): Map<string, number> {
  const sorted = [...new Set(appIds)].sort();
  const start = hueOf(sorted.join(','));
  return new Map(sorted.map((id, index) => [id, Math.round((start + index * GOLDEN_ANGLE) % 360)]));
}

/**
 * The colour of an application's name for a hue, readable in every theme: a vivid hue pulled a
 * quarter of the way toward the text colour, which is dark in light themes and light in dark ones.
 */
export function hueColor(hue: number): string {
  return `color-mix(in oklch, oklch(0.66 0.17 ${hue}), var(--cvc-text) 25%)`;
}

/** A light wash of the hue behind a line, enough to tell applications apart in either theme. */
export function hueTint(hue: number): string {
  return `color-mix(in oklch, oklch(0.66 0.17 ${hue}) 10%, transparent)`;
}
