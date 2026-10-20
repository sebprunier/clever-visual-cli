import { describe, expect, it } from 'vitest';
import type { Deployment } from '../../data/api.js';
import { appStatus } from './status.js';

const deployment = (state: Deployment['state']) => ({ state }) as Deployment;

describe('appStatus', () => {
  it('tells a running application from one being redeployed or whose redeployment failed', () => {
    expect(appStatus('SHOULD_BE_UP', null)).toBe('running');
    expect(appStatus('SHOULD_BE_UP', deployment('SUCCEEDED'))).toBe('running');
    expect(appStatus('SHOULD_BE_UP', deployment('CANCELLED'))).toBe('running');
    expect(appStatus('SHOULD_BE_UP', deployment('WORK_IN_PROGRESS'))).toBe('restarting');
    expect(appStatus('SHOULD_BE_UP', deployment('FAILED'))).toBe('restart-failed');
  });

  it('tells a stopped application from one starting or whose start failed', () => {
    expect(appStatus('SHOULD_BE_DOWN', deployment('SUCCEEDED'))).toBe('stopped');
    expect(appStatus('SHOULD_BE_DOWN', deployment('TASK_IN_PROGRESS'))).toBe('starting');
    expect(appStatus('SHOULD_BE_DOWN', deployment('FAILED'))).toBe('start-failed');
    expect(appStatus('WANTS_TO_BE_UP', null)).toBe('starting');
    expect(appStatus('WANTS_TO_BE_UP', deployment('FAILED'))).toBe('start-failed');
  });

  it('puts moderation and payment default apart', () => {
    expect(appStatus('MODERATED', deployment('SUCCEEDED'))).toBe('blocked');
    expect(appStatus('DEFAULT_OF_PAYMENT', null)).toBe('blocked');
  });
});
