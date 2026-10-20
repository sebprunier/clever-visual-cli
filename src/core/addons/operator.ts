/**
 * Operators: add-ons Clever Cloud runs on top of an application and other
 * add-ons, Keycloak and Otoroshi for now (Matomo and Metabase share the API
 * and join when they can be checked). Their `clever` commands.
 */
import type { OperatorKind } from '../../data/api.js';

const KINDS: Readonly<Record<string, OperatorKind>> = { keycloak: 'keycloak', otoroshi: 'otoroshi' };
const PRODUCTS: Readonly<Record<OperatorKind, string>> = { keycloak: 'Keycloak', otoroshi: 'Otoroshi' };

/** `keycloak` for the Keycloak provider; null for an add-on that is not an operator. */
export function operatorKind(providerId: string): OperatorKind | null {
  return KINDS[providerId] ?? null;
}

export function operatorProduct(kind: OperatorKind): string {
  return PRODUCTS[kind];
}

export type OperatorAction = 'restart' | 'rebuild' | 'update';

/** `clever keycloak restart <id>`, `… rebuild <id>`, `… version update <id> --target <version>`. */
export function operatorCommand(kind: OperatorKind, action: OperatorAction, addonId: string, target = ''): string {
  return action === 'update'
    ? `clever ${kind} version update ${addonId} --target ${target}`
    : `clever ${kind} ${action} ${addonId}`;
}
