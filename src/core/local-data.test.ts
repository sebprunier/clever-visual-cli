import { describe, expect, it } from 'vitest';
import { eraseLocalData } from './local-data.js';

/** A Storage in memory, as a browser's. */
function memoryStorage(entries: Record<string, string>): Storage {
  const items = new Map(Object.entries(entries));
  return {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
}

const keys = (storage: Storage) => Array.from({ length: storage.length }, (_, index) => storage.key(index));

describe('eraseLocalData', () => {
  it('removes every key of clever-visual-cli from both storages, and nothing else (#16)', () => {
    const local = memoryStorage({
      'cvc.vault': '{}',
      'cvc.locale': 'fr',
      'cvc.theme': 'dark',
      'cvc.lastOwnerId': 'orga_1',
      'cvc.appNav': 'folded',
      'cvc.logs.mode': 'both',
      'cvc.logs.layout': 'merged',
      'cvc.home.orga_1': '{}',
      'another-app.setting': 'kept',
    });
    const session = memoryStorage({ 'cvc.vault.key': 'k', 'cvc.env-changed': '1', other: 'kept' });
    eraseLocalData([local, session]);
    expect(keys(local)).toEqual(['another-app.setting']);
    expect(keys(session)).toEqual(['other']);
  });
});
