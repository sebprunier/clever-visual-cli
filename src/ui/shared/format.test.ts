import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../core/i18n.js';
import { formatTime } from './format.js';

describe('formatTime', () => {
  afterEach(() => setLocale('en', false));

  it('uses a 24-hour clock in every language, to fit the time column of the logs', () => {
    for (const locale of ['en', 'fr'] as const) {
      setLocale(locale, false);
      expect(formatTime('2026-10-21T21:05:09Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    }
  });
});
