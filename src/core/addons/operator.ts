/**
 * Operators: add-ons Clever Cloud runs on top of an application and other
 * add-ons, Keycloak and Otoroshi for now (Matomo and Metabase share the API
 * and join when they can be checked). Their `clever` commands, and the ones
 * with an update out, for "To watch".
 */
import type { AddonSummary, ApplicationSummary, OperatorKind, OperatorVersions } from '../../data/api.js';
import type { AddonState } from '../home/addon-state.js';

const KINDS: Readonly<Record<string, OperatorKind>> = { keycloak: 'keycloak', otoroshi: 'otoroshi' };
const PRODUCTS: Readonly<Record<OperatorKind, string>> = { keycloak: 'Keycloak', otoroshi: 'Otoroshi' };

/** `keycloak` for the Keycloak provider; null for an add-on that is not an operator. */
export function operatorKind(providerId: string): OperatorKind | null {
  return KINDS[providerId] ?? null;
}

export function operatorProduct(kind: OperatorKind): string {
  return PRODUCTS[kind];
}

/**
 * An operator has no add-on instance of its own: it runs as its entrypoint
 * application, dedicated, so its state is that application's.
 */
export function operatorState(appState: ApplicationSummary['state']): AddonState {
  switch (appState) {
    case 'SHOULD_BE_UP':
      return 'up';
    case 'WANTS_TO_BE_UP':
      return 'starting';
    default:
      return 'down';
  }
}

export type OperatorAction = 'restart' | 'rebuild' | 'update';

/** `clever keycloak restart <id>`, `… rebuild <id>`, `… version update <id> --target <version>`. */
export function operatorCommand(kind: OperatorKind, action: OperatorAction, addonId: string, target = ''): string {
  return action === 'update'
    ? `clever ${kind} version update ${addonId} --target ${target}`
    : `clever ${kind} ${action} ${addonId}`;
}

/** An operator with a newer version out. */
export interface OperatorWatchItem {
  kind: 'update';
  addon: AddonSummary;
  installed: string;
  latest: string;
}

/** The operators of the "To watch" card, by name. */
export function operatorWatchList(
  addons: readonly AddonSummary[],
  versions: (addon: AddonSummary) => OperatorVersions | null,
): OperatorWatchItem[] {
  const items: OperatorWatchItem[] = [];
  for (const addon of addons) {
    if (operatorKind(addon.providerId) == null) {
      continue;
    }
    const check = versions(addon);
    if (check?.needUpdate) {
      items.push({ kind: 'update', addon, installed: check.installed, latest: check.latest });
    }
  }
  return items.sort((a, b) => a.addon.name.localeCompare(b.addon.name));
}
