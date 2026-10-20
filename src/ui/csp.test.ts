import { describe, expect, it } from 'vitest';

/**
 * The production CSP (`style-src 'self'`, see `vite.config.ts`) refuses inline styles: a
 * template that writes a `style` attribute renders fine in development and loses its styles
 * once published. Dynamic styles go through `inlineStyle()` (`shared/inline-style.ts`).
 */
const SOURCES = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

function offenders(pattern: RegExp): string[] {
  return Object.entries(SOURCES)
    .filter(([, text]) => pattern.test(text))
    .map(([path]) => path);
}

describe('the interface under the production CSP', () => {
  it('reads every module', () => {
    expect(Object.keys(SOURCES)).toContain('./shared/status.ts');
  });

  it('writes no style attribute', () => {
    expect(offenders(/\sstyle=/)).toEqual([]);
  });

  it('does without styleMap, which writes the attribute on its first render', () => {
    expect(offenders(/directives\/style-map/)).toEqual([]);
  });
});
