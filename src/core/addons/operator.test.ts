import { describe, expect, it } from 'vitest';
import { operatorCommand, operatorKind } from './operator.js';

describe('operators', () => {
  it('knows Keycloak and Otoroshi only', () => {
    expect(operatorKind('keycloak')).toBe('keycloak');
    expect(operatorKind('otoroshi')).toBe('otoroshi');
    expect(operatorKind('postgresql-addon')).toBeNull();
  });

  it('gives the clever-tools commands', () => {
    expect(operatorCommand('keycloak', 'restart', 'addon_1')).toBe('clever keycloak restart addon_1');
    expect(operatorCommand('otoroshi', 'rebuild', 'addon_2')).toBe('clever otoroshi rebuild addon_2');
    expect(operatorCommand('keycloak', 'update', 'addon_1', '26.8.0')).toBe(
      'clever keycloak version update addon_1 --target 26.8.0',
    );
  });
});
