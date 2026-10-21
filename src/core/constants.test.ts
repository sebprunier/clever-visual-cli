import { describe, expect, it } from 'vitest';
import pkg from '../../package.json?raw';
import { APP_RELEASE_URL, APP_VERSION } from './constants.js';

describe('version', () => {
  it('is the one of package.json, with its GitHub release', () => {
    const { version } = JSON.parse(pkg) as { version: string };
    expect(APP_VERSION).toBe(version);
    expect(APP_RELEASE_URL).toBe(`https://github.com/sebprunier/clever-visual-cli/releases/tag/v${version}`);
  });
});
