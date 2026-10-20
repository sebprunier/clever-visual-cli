import { describe, expect, it } from 'vitest';
import { compareReleases, isNewerRelease, releaseNotesUrl } from './cli-release.js';

describe('releases', () => {
  it('orders versions numerically', () => {
    expect(compareReleases('5.10.0', '5.2.0')).toBeGreaterThan(0);
    expect(compareReleases('5.2.0', '5.2.0')).toBe(0);
    expect(compareReleases('5.2.1', '5.3.0')).toBeLessThan(0);
    expect(compareReleases('6.0.0-beta.1', '6.0.0')).toBe(0);
  });

  it('warns only for a newer release', () => {
    expect(isNewerRelease('5.3.0', '5.2.0')).toBe(true);
    expect(isNewerRelease('5.2.0', '5.2.0')).toBe(false);
    expect(isNewerRelease('5.1.0', '5.2.0')).toBe(false);
    expect(isNewerRelease(null, '5.2.0')).toBe(false);
  });

  it('links to the release notes of a version', () => {
    expect(releaseNotesUrl('5.3.0')).toBe('https://github.com/CleverCloud/clever-tools/releases/tag/5.3.0');
  });
});
