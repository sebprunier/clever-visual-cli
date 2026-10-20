import { describe, expect, it } from 'vitest';
import type { AddonSummary } from '../../data/api.js';
import {
  displayVersion,
  operatorCommand,
  operatorKind,
  operatorState,
  operatorWatchList,
  otoroshictlCommands,
  readVersionCheck,
} from './operator.js';

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

  it('does not call an operator installed as latest behind', () => {
    expect(readVersionCheck('latest', 'v17.17.0_1784304500', [], true)).toMatchObject({
      needUpdate: false,
      followsLatest: true,
    });
    expect(readVersionCheck('26.7.2', '26.8.0', ['26.8.0'], true)).toMatchObject({
      needUpdate: true,
      followsLatest: false,
    });
  });

  it('shows Otoroshi versions without their build timestamp', () => {
    expect(displayVersion('v17.17.0_1784304500')).toBe('v17.17.0');
    expect(displayVersion('26.8.0')).toBe('26.8.0');
  });

  it('gives the clever-tools commands', () => {
    expect(operatorCommand('keycloak', 'restart', 'addon_1')).toBe('clever keycloak restart addon_1');
    expect(operatorCommand('otoroshi', 'rebuild', 'addon_2')).toBe('clever otoroshi rebuild addon_2');
    expect(operatorCommand('keycloak', 'update', 'addon_1', '26.8.0')).toBe(
      'clever keycloak version update addon_1 --target 26.8.0',
    );
  });

  it('adds an Otoroshi to otoroshictl through its clever-tools configuration', () => {
    expect(otoroshictlCommands('addon_3')).toContain(
      'clever otoroshi get-config addon_3 | otoroshictl config import --current --stdin',
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
      (candidate) =>
        versions[candidate.id] ? { ...versions[candidate.id], available: [], followsLatest: false } : null,
    );
    expect(items.map((item) => [item.addon.name, item.installed, item.latest])).toEqual([
      ['gateway', 'latest', 'v17.17.0'],
      ['PROD-auth', '26.7.2', '26.8.0'],
    ]);
  });
});
