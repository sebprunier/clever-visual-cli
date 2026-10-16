/**
 * Interface language: English and French, picked from the browser unless the
 * user chose one (kept in localStorage). `t()` reads the current dictionary;
 * components extending `CvcElement` re-render when the language changes.
 */
import { en, type MessageKey } from '../i18n/en.js';
import { fr } from '../i18n/fr.js';

export type Locale = 'en' | 'fr';
export type { MessageKey };

export const LOCALES: ReadonlyArray<{ id: Locale; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
];

const STORAGE_KEY = 'cvc.locale';
const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, fr };

/** Dispatches `change` after every language switch. */
export const localeChanges = new EventTarget();

let current: Locale = detectLocale();

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'fr';
}

/** The stored choice, else the first browser language we support, else English. */
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) {
      return stored;
    }
  } catch {
    // No storage: fall through to the browser.
  }
  const languages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  for (const language of languages) {
    const base = (language ?? '').slice(0, 2).toLowerCase();
    if (isLocale(base)) {
      return base;
    }
  }
  return 'en';
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale, persist = true): void {
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Not essential.
    }
  }
  if (locale === current) {
    return;
  }
  current = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  localeChanges.dispatchEvent(new Event('change'));
}

export type MessageParams = Record<string, string | number>;

/**
 * The message for `key` in the current language, with `{name}` placeholders
 * filled from `params`. When `params.count` is a number and a `<key>_one`
 * message exists, the singular form is used where the language wants it.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const messages = MESSAGES[current];
  let template: string = messages[key] ?? en[key] ?? key;
  if (params != null && typeof params.count === 'number') {
    const form = new Intl.PluralRules(current).select(params.count);
    const singular = `${key}_one` as MessageKey;
    if (form === 'one' && messages[singular] != null) {
      template = messages[singular];
    }
  }
  if (params == null) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
