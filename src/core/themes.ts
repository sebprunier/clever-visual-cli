/**
 * The looks of the interface, as data: one palette of tokens per theme,
 * applied as CSS custom properties on <html>, which every component reads
 * through `var(--cvc-…)` (shadow roots inherit them). "System" follows the
 * operating system between light and dark. The choice is remembered per
 * browser (`cvc.theme`).
 */
import type { MessageKey } from './i18n.js';

export type PaletteId = 'light' | 'dark' | 'modern';
export type ThemeId = 'system' | PaletteId;

export interface Palette {
  colorScheme: 'light' | 'dark';
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  /** Text on an accent background (primary buttons). */
  accentText: string;
  danger: string;
  ok: string;
  warn: string;
  info: string;
  radius: string;
  /** Resting cards. */
  shadow: string;
  /** A card under the pointer. */
  shadowHover: string;
  /** Menus, dialogs, notifications. */
  shadowPop: string;
  /** Behind a dialog. */
  backdrop: string;
  /** Around the selected element (current application of the list column). */
  glow: string;
  /** Small labels: field names, column headers, facts. */
  labelFont: string;
}

const SYSTEM_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const PALETTES: Record<PaletteId, Palette> = {
  light: {
    colorScheme: 'light',
    bg: '#f6f7f9',
    surface: '#ffffff',
    border: '#d9dde3',
    text: '#1b1f24',
    muted: '#5c6670',
    // A blue accent: red stays for errors, even if it is Clever Cloud's colour.
    accent: '#0969da',
    accentText: '#ffffff',
    danger: '#b42318',
    ok: '#1a7f37',
    warn: '#9a6700',
    info: '#0969da',
    radius: '8px',
    shadow: 'none',
    shadowHover: 'none',
    shadowPop: '0 8px 24px rgb(0 0 0 / 16%)',
    backdrop: 'rgb(0 0 0 / 35%)',
    glow: 'none',
    labelFont: SYSTEM_FONT,
  },
  dark: {
    colorScheme: 'dark',
    bg: '#0f1216',
    surface: '#171b21',
    border: '#2b323b',
    text: '#e6e9ed',
    muted: '#9aa4af',
    accent: '#58a6ff',
    accentText: '#0f1216',
    danger: '#ff6b61',
    ok: '#4cc26b',
    warn: '#e3b341',
    info: '#58a6ff',
    radius: '8px',
    shadow: 'none',
    shadowHover: 'none',
    shadowPop: '0 10px 30px rgb(0 0 0 / 50%)',
    backdrop: 'rgb(0 0 0 / 55%)',
    glow: 'none',
    labelFont: SYSTEM_FONT,
  },
  // After the Clever Cloud technologies page: night blue, indigo borders, a cyan accent that glows.
  modern: {
    colorScheme: 'dark',
    bg: '#0a0d17',
    surface: '#0f1426',
    border: '#27315a',
    text: '#e8ecf5',
    muted: '#94a0c8',
    accent: '#3fd0ea',
    accentText: '#06101a',
    danger: '#ff6b81',
    ok: '#3ddc97',
    warn: '#f5c451',
    info: '#3fd0ea',
    radius: '10px',
    shadow: '0 1px 0 rgb(255 255 255 / 3%) inset',
    shadowHover: '0 0 0 1px rgb(63 208 234 / 35%), 0 0 22px rgb(63 208 234 / 12%)',
    shadowPop: '0 0 0 1px #27315a, 0 16px 44px rgb(0 0 0 / 60%)',
    backdrop: 'rgb(3 6 15 / 72%)',
    glow: '0 0 0 1px rgb(63 208 234 / 45%), 0 0 16px rgb(63 208 234 / 22%)',
    labelFont: MONO_FONT,
  },
};

export const THEMES: ReadonlyArray<{ id: ThemeId; label: MessageKey }> = [
  { id: 'system', label: 'theme.system' },
  { id: 'light', label: 'theme.light' },
  { id: 'dark', label: 'theme.dark' },
  { id: 'modern', label: 'theme.modern' },
];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function resolveTheme(theme: ThemeId, prefersDark: boolean): PaletteId {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
}

/** The custom properties a palette sets on <html>. */
export function paletteProperties(palette: Palette): Record<string, string> {
  return {
    '--cvc-bg': palette.bg,
    '--cvc-surface': palette.surface,
    '--cvc-border': palette.border,
    '--cvc-text': palette.text,
    '--cvc-muted': palette.muted,
    '--cvc-accent': palette.accent,
    '--cvc-accent-text': palette.accentText,
    '--cvc-danger': palette.danger,
    '--cvc-ok': palette.ok,
    '--cvc-warn': palette.warn,
    '--cvc-info': palette.info,
    '--cvc-radius': palette.radius,
    '--cvc-shadow': palette.shadow,
    '--cvc-shadow-hover': palette.shadowHover,
    '--cvc-shadow-pop': palette.shadowPop,
    '--cvc-backdrop': palette.backdrop,
    '--cvc-glow': palette.glow,
    '--cvc-label-font': palette.labelFont,
  };
}

/** WCAG 2 contrast ratio of two `#rgb` or `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function luminance(hex: string): number {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const [r, g, b] = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(full.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// --- in the browser ----------------------------------------------------------

const THEME_KEY = 'cvc.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
/** Dispatched on window when the chosen theme changes. */
export const THEME_EVENT = 'cvc-theme-change';

let current: ThemeId = 'system';

export function getTheme(): ThemeId {
  return current;
}

/** Reads the remembered choice, applies it, and follows the system while "system" is chosen. */
export function initTheme(): void {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    current = isThemeId(stored) ? stored : 'system';
  } catch {
    current = 'system';
  }
  applyTheme();
  window.matchMedia?.(DARK_QUERY).addEventListener('change', () => {
    if (current === 'system') {
      applyTheme();
    }
  });
}

export function setTheme(theme: ThemeId): void {
  current = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not essential: the choice lasts for this page.
  }
  applyTheme();
  window.dispatchEvent(new Event(THEME_EVENT));
}

function applyTheme(): void {
  const id = resolveTheme(current, window.matchMedia?.(DARK_QUERY).matches ?? false);
  const palette = PALETTES[id];
  const root = document.documentElement;
  for (const [name, value] of Object.entries(paletteProperties(palette))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = palette.colorScheme;
  root.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.bg);
}
