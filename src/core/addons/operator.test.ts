import { describe, expect, it } from 'vitest';
import type { AddonSummary } from '../../data/api.js';
import { operatorCommand, operatorKind, operatorState, operatorWatchList } from './operator.js';

describe('operators', () => {
  it('knows Keycloak and Otoroshi only', () => {
    expect(operatorKind('keycloak')).toBe('keycloak');
    expect(operatorKind('otoroshi')).toBe('otoroshi');
    expect(operatorKind('postgresql-addon')).toBeNull();
  });

  it('takes the state of the entrypoint application, never "shared"', () => {
    expect(operatorState('SHOULD_BE_UP')).toBe('up');
    expect(operatorState('WANTS_TO_BE_UP')).toBe('starting');
    expect(operatorState('SHOULD_BE_DOWN')).toBe('down');
    expect(operatorState('MODERATED')).toBe('down');
  });

  it('gives the clever-tools commands', () => {
    expect(operatorCommand('keycloak', 'restart', 'addon_1')).toBe('clever keycloak restart addon_1');
    expect(operatorCommand('otoroshi', 'rebuild', 'addon_2')).toBe('clever otoroshi rebuild addon_2');
    expect(operatorCommand('keycloak', 'update', 'addon_1', '26.8.0')).toBe(
      'clever keycloak version update addon_1 --target 26.8.0',
    );
  });

  it('lists the operators with an update out, by name', () => {
    const addon = (id: string, name: string, providerId: string) => ({ id, name, providerId }) as AddonSummary;
    const versions: Record<string, { installed: string; latest: string; needUpdate: boolean }> = {
      a: { installed: '26.7.2', latest: '26.8.0', needUpdate: true },
      b: { installed: '26.8.0', latest: '26.8.0', needUpdate: false },
      c: { installed: 'latest', latest: 'v17.17.0', needUpdate: true },
    };
    const items = operatorWatchList(
      [addon('a', 'PROD-auth', 'keycloak'), addon('b', 'DEV-auth', 'keycloak'), addon('c', 'gateway', 'otoroshi')],
      (candidate) => (versions[candidate.id] ? { ...versions[candidate.id], available: [] } : null),
    );
    expect(items.map((item) => [item.addon.name, item.installed, item.latest])).toEqual([
      ['gateway', 'latest', 'v17.17.0'],
      ['PROD-auth', '26.7.2', '26.8.0'],
    ]);
  });
});
