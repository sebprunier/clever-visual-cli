import { describe, expect, it } from 'vitest';
import type { AddonInstance } from '../../data/api.js';
import { addonState } from './addon-state.js';

const instances = (...states: AddonInstance['state'][]) => states.map((state) => ({ state }));

describe('addonState', () => {
  it('calls an add-on without live instances shared', () => {
    expect(addonState([])).toBe('shared');
    expect(addonState(instances('DELETED'))).toBe('shared');
  });

  it('reads the dedicated ones from their instances, the telling state first', () => {
    expect(addonState(instances('UP'))).toBe('up');
    expect(addonState(instances('READY', 'DELETED'))).toBe('up');
    expect(addonState(instances('UP', 'MIGRATION_IN_PROGRESS'))).toBe('migrating');
    expect(addonState(instances('UP', 'BOOTING'))).toBe('starting');
    expect(addonState(instances('STOPPING'))).toBe('stopping');
    expect(addonState(instances('GHOST'))).toBe('down');
  });
});
