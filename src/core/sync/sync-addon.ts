/**
 * The add-on the sync of #1 keeps its data in, recognised by its name in the
 * personal space. Apart from the store, which needs the browser client, so the
 * actions can tell it too.
 */
import type { AddonSummary } from '../../data/api.js';

export const SYNC_ADDON_NAME = 'clever-visual-cli';
export const SYNC_PROVIDER = 'config-provider';

/** The add-on the sync uses, found by this name: renaming it would switch the sync off (#26). */
export function isSyncAddon(ownerId: string, addon: Pick<AddonSummary, 'providerId' | 'name'>): boolean {
  return ownerId.startsWith('user_') && addon.providerId === SYNC_PROVIDER && addon.name === SYNC_ADDON_NAME;
}
