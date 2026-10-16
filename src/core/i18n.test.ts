import { afterEach, describe, expect, it } from 'vitest';
import { en } from '../i18n/en.js';
import { fr } from '../i18n/fr.js';
import { getLocale, setLocale, t } from './i18n.js';

describe('i18n', () => {
  afterEach(() => setLocale('en', false));

  it('ships the same keys in every language, with no empty message', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(fr)) {
      expect(value, key).not.toBe('');
    }
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    setLocale('en', false);
    expect(t('login.save.connected', { name: 'Ada' })).toBe('Signed in: Ada');
    expect(t('dialog.min', { field: 'Instances' })).toBe('“Instances” must be at least {min}.');
  });

  it('picks the singular form from count, per language', () => {
    setLocale('en', false);
    expect(t('home.apps', { count: 1 })).toBe('1 app');
    expect(t('home.apps', { count: 0 })).toBe('0 apps');
    expect(t('home.apps', { count: 2 })).toBe('2 apps');
    setLocale('fr', false);
    expect(getLocale()).toBe('fr');
    expect(t('home.apps', { count: 0 })).toBe('0 app');
    expect(t('home.apps', { count: 2 })).toBe('2 apps');
    expect(t('tags.applied', { count: 1 })).toBe('1 modification de tags appliquée.');
  });

  it('keeps French placeholders consistent with English ones', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(fr[key]), key).toEqual(placeholders(en[key]));
    }
  });
});
