import { describe, expect, it } from 'vitest';
import { describeBulkStep, planBulk, type BulkApp } from './bulk.js';

const app = (name: string, state: BulkApp['state'] = 'SHOULD_BE_UP'): BulkApp => ({ id: `app_${name}`, name, state });

describe('planBulk', () => {
  const apps = [app('up'), app('down', 'SHOULD_BE_DOWN'), app('wants', 'WANTS_TO_BE_UP')];

  it('restarts every application, stopped ones included', () => {
    const plan = planBulk('restart', apps);
    expect(plan.steps.map((step) => step.app.name)).toEqual(['up', 'down', 'wants']);
    expect(plan.alreadyStopped).toEqual([]);
  });

  it('leaves an application already stopped out of a stop', () => {
    const plan = planBulk('stop', apps);
    expect(plan.steps.map((step) => step.app.name)).toEqual(['up', 'wants']);
    expect(plan.alreadyStopped.map((left) => left.name)).toEqual(['down']);
  });

  it('maps a step to its clever command', () => {
    expect(describeBulkStep({ kind: 'stop', app: app('x') })).toBe('clever stop --app app_x');
    expect(describeBulkStep({ kind: 'restart', app: app('x') })).toBe('clever restart --app app_x');
  });
});
