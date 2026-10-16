import { describe, expect, it } from 'vitest';
import type { ApplicationSummary, Deployment } from '../../data/api.js';
import { describeOrigin, indexActivity, watchList } from './activity.js';

function deployment(partial: Partial<Deployment> & { applicationId: string; date: string }): Deployment {
  return {
    id: `deployment_${partial.date}`,
    index: 1,
    state: 'SUCCEEDED',
    action: 'DEPLOY',
    instances: 1,
    author: {},
    ...partial,
  };
}

function app(partial: Partial<ApplicationSummary> & { id: string }): ApplicationSummary {
  return {
    name: partial.id,
    instanceType: 'node',
    variantName: 'Node.js',
    variantSlug: 'node',
    isArchived: false,
    isZeroDowntimeDeploymentEnabled: false,
    variantLogoUrl: '',
    state: 'SHOULD_BE_UP',
    commitId: '',
    systemTags: [],
    customerTags: [],
    ...partial,
  };
}

const NOW = Date.parse('2026-10-16T12:00:00Z');

describe('home activity', () => {
  it('keeps the latest deployment and the latest human one per application', () => {
    const index = indexActivity([
      deployment({
        applicationId: 'a',
        date: '2026-10-01T00:00:00Z',
        author: { id: 'user_1', name: 'Seb' },
        cause: 'github',
      }),
      deployment({ applicationId: 'a', date: '2026-10-10T00:00:00Z', cause: 'Maintenance/ImageUpdate' }),
      deployment({ applicationId: 'b', date: '2026-09-01T00:00:00Z', cause: 'Monitoring/Unreachable' }),
    ]);
    expect(index.get('a')?.last.date).toBe('2026-10-10T00:00:00Z');
    expect(index.get('a')?.lastHuman?.date).toBe('2026-10-01T00:00:00Z');
    expect(index.get('b')?.lastHuman).toBeNull();
    expect(index.has('c')).toBe(false);
  });

  it('describes who or what triggered a deployment', () => {
    expect(
      describeOrigin(deployment({ applicationId: 'a', date: 'd', author: { id: 'user_1', name: 'Seb' } }), 'user_1'),
    ).toBe('toi');
    expect(
      describeOrigin(deployment({ applicationId: 'a', date: 'd', author: { id: 'user_2', name: 'Alice' } }), 'user_1'),
    ).toBe('Alice');
    expect(describeOrigin(deployment({ applicationId: 'a', date: 'd', cause: 'Maintenance/ImageUpdate/1/2' }))).toBe(
      'maintenance',
    );
    expect(describeOrigin(deployment({ applicationId: 'a', date: 'd', cause: 'Monitoring/Unreachable' }))).toBe(
      'monitoring',
    );
    expect(describeOrigin(deployment({ applicationId: 'a', date: 'd' }))).toBe('plateforme');
  });

  it('lists what deserves attention, failures first', () => {
    const activity = indexActivity([
      deployment({ applicationId: 'failed-up', date: '2026-01-01T00:00:00Z', state: 'FAILED' }),
      deployment({ applicationId: 'failed-old-down', date: '2026-01-01T00:00:00Z', state: 'FAILED' }),
      deployment({ applicationId: 'failed-recent-down', date: '2026-10-15T00:00:00Z', state: 'FAILED' }),
      deployment({ applicationId: 'wip', date: '2026-10-16T11:00:00Z', state: 'WORK_IN_PROGRESS' }),
      deployment({ applicationId: 'starting', date: '2026-10-16T11:50:00Z' }),
      deployment({ applicationId: 'stuck', date: '2026-03-01T00:00:00Z' }),
      deployment({ applicationId: 'fine', date: '2026-10-16T11:00:00Z' }),
    ]);
    const items = watchList(
      [
        app({ id: 'fine' }),
        app({ id: 'wip' }),
        app({ id: 'failed-up' }),
        app({ id: 'failed-old-down', state: 'SHOULD_BE_DOWN' }),
        app({ id: 'failed-recent-down', state: 'SHOULD_BE_DOWN' }),
        app({ id: 'starting', state: 'WANTS_TO_BE_UP' }),
        app({ id: 'stuck', state: 'WANTS_TO_BE_UP' }),
        app({ id: 'never', state: 'WANTS_TO_BE_UP' }),
        app({ id: 'moderated', state: 'MODERATED' }),
        app({ id: 'archived', state: 'MODERATED', isArchived: true }),
      ],
      activity,
      NOW,
    );
    expect(items.map((item) => `${item.kind}:${item.app.id}`)).toEqual([
      'failed:failed-recent-down',
      'failed:failed-up',
      'deploying:starting',
      'deploying:wip',
      'moderated:moderated',
    ]);
  });
});
