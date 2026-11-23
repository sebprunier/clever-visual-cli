/**
 * The states of the home list in words. The list shows them in the language of
 * the page; `state:` reads them in every language, so a shared link or a saved
 * view keeps matching after a language switch (#44).
 */
import type { ApplicationSummary } from '../../data/api.js';
import { t, translations, type MessageKey } from '../i18n.js';
import type { AddonState } from './addon-state.js';

const APP_STATES: ReadonlyArray<ApplicationSummary['state']> = [
  'SHOULD_BE_UP',
  'WANTS_TO_BE_UP',
  'SHOULD_BE_DOWN',
  'MODERATED',
  'DEFAULT_OF_PAYMENT',
];
const ADDON_STATES: readonly AddonState[] = ['up', 'starting', 'migrating', 'stopping', 'down', 'shared'];

export function appStateKey(state: ApplicationSummary['state']): MessageKey {
  return `state.app.${state}`;
}

/** An add-on state in words: the applications' words where they fit, so `state:` and grouping read both. */
export function addonStateKey(state: AddonState): MessageKey {
  switch (state) {
    case 'up':
      return 'state.app.SHOULD_BE_UP';
    case 'starting':
      return 'state.app.WANTS_TO_BE_UP';
    case 'migrating':
      return 'addonState.migrating';
    case 'shared':
      return 'addonState.shared';
    default:
      return 'state.app.SHOULD_BE_DOWN';
  }
}

/** The words of an application state, in every language. */
export function appStateWords(state: ApplicationSummary['state']): string[] {
  return translations(appStateKey(state));
}

/** The words of an add-on state, in every language. */
export function addonStateWords(state: AddonState): string[] {
  return translations(addonStateKey(state));
}

function allKeys(): MessageKey[] {
  return [...new Set([...APP_STATES.map(appStateKey), ...ADDON_STATES.map(addonStateKey)])];
}

/** Every state, in the language of the page: what a note about an unknown state lists. */
export function stateNames(): string[] {
  return allKeys().map((key) => t(key));
}

/** Every state, in every language: what `state:` can match. */
export function stateVocabulary(): string[] {
  return allKeys().flatMap(translations);
}
