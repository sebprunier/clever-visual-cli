import { describe, expect, it } from 'vitest';
import { awaitsDeployment } from './env-pending.js';

describe('awaitsDeployment', () => {
  const changedAt = Date.parse('2026-10-20T10:00:00Z');

  it('waits until a deployment newer than the change', () => {
    expect(awaitsDeployment(changedAt, '2026-10-20T09:00:00.000Z')).toBe(true);
    expect(awaitsDeployment(changedAt, '2026-10-20T10:00:05.000Z')).toBe(false);
    expect(awaitsDeployment(changedAt, null)).toBe(true);
  });

  it('waits for the deployments to be known', () => {
    expect(awaitsDeployment(changedAt, undefined)).toBe(false);
  });

  it('says nothing without a change made here', () => {
    expect(awaitsDeployment(null, '2026-10-20T09:00:00.000Z')).toBe(false);
  });
});
