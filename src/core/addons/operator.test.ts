import { describe, expect, it } from 'vitest';
import { operatorKind } from './operator.js';

describe('operators', () => {
  it('knows Keycloak and Otoroshi only', () => {
    expect(operatorKind('keycloak')).toBe('keycloak');
    expect(operatorKind('otoroshi')).toBe('otoroshi');
    expect(operatorKind('postgresql-addon')).toBeNull();
  });
});
