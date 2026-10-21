/**
 * What clever-visual-cli keeps in this browser: every key it writes starts with
 * `cvc.`, in `localStorage` (the vault, preferences, caches) and in
 * `sessionStorage` (the key of an unlocked vault, the tab-only accounts, recent
 * changes of variables).
 */
const PREFIX = 'cvc.';

/**
 * "Erase everything from this browser": removes every key of clever-visual-cli
 * from both storages, so that a key added later cannot be forgotten (#16).
 * Other keys of the origin are left alone.
 */
export function eraseLocalData(storages: readonly Storage[] = defaultStorages()): void {
  for (const storage of storages) {
    try {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith(PREFIX)) {
          keys.push(key);
        }
      }
      for (const key of keys) {
        storage.removeItem(key);
      }
    } catch {
      // Storage unavailable: nothing was kept there.
    }
  }
}

function defaultStorages(): Storage[] {
  const storages: Storage[] = [];
  try {
    storages.push(localStorage, sessionStorage);
  } catch {
    // Storage blocked by the browser.
  }
  return storages;
}
