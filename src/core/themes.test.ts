import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';
import { contrastRatio, PALETTES, paletteProperties, resolveTheme, type PaletteId } from './themes.js';

/** WCAG AA for normal text. */
const AA = 4.5;

describe('palettes', () => {
  for (const [id, palette] of Object.entries(PALETTES) as Array<[PaletteId, (typeof PALETTES)[PaletteId]]>) {
    it(`${id} reads at WCAG AA`, () => {
      const pairs: Array<[string, string, string]> = [
        ['text on background', palette.text, palette.bg],
        ['text on surface', palette.text, palette.surface],
        ['muted on surface', palette.muted, palette.surface],
        ['muted on background', palette.muted, palette.bg],
        ['button text on accent', palette.accentText, palette.accent],
        ['links on surface', palette.accent, palette.surface],
        ['danger on surface', palette.danger, palette.surface],
        ['ok on surface', palette.ok, palette.surface],
        ['warn on surface', palette.warn, palette.surface],
      ];
      for (const [label, foreground, background] of pairs) {
        expect(contrastRatio(foreground, background), `${id}: ${label}`).toBeGreaterThanOrEqual(AA);
      }
    });
  }

  it('measures contrast the WCAG way', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('sets every token on every palette', () => {
    const names = Object.keys(paletteProperties(PALETTES.light));
    for (const palette of Object.values(PALETTES)) {
      const properties = paletteProperties(palette);
      expect(Object.keys(properties)).toEqual(names);
      expect(Object.values(properties).every((value) => value !== '')).toBe(true);
    }
  });

  it('follows the system only when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('modern', false)).toBe('modern');
  });

  it('keeps the no-JavaScript fallback of index.css in step with the palettes', () => {
    expect(css).toContain(`--cvc-bg: ${PALETTES.light.bg};`);
    expect(css).toContain(`--cvc-bg: ${PALETTES.dark.bg};`);
    expect(css).toContain(`--cvc-bg: ${PALETTES.modern.bg};`);
  });
});
