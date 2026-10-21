import { describe, expect, it } from 'vitest';
import {
  deploymentLogsCommand,
  deploymentLogsHash,
  deploymentSince,
  parseFrom,
  parseRestarts,
  restartsLogsHash,
} from './deployment-logs.js';

describe('deployment logs', () => {
  it('starts a minute before the deployment, and says so in the command', () => {
    const since = deploymentSince('2026-10-17T15:31:35.000Z');
    expect(since.toISOString()).toBe('2026-10-17T15:30:35.000Z');
    expect(deploymentLogsCommand('app_1', 'deployment_2', since)).toBe(
      'clever logs --app app_1 --deployment-id deployment_2 --since 2026-10-17T15:30:35Z',
    );
  });

  it('opens the Logs tab on a deployment, keeping the list of the home page', () => {
    expect(deploymentLogsHash('orga_1', 'app_1', 'deployment_2')).toBe(
      '#/orga/orga_1/app/app_1/logs?deployment=deployment_2',
    );
    expect(deploymentLogsHash('orga_1', 'app_1', 'deployment_2', { filter: 'env:prod', grouping: '' })).toBe(
      '#/orga/orga_1/app/app_1/logs?deployment=deployment_2&q=env%3Aprod',
    );
  });

  it('round-trips the restarts of a selection through the URL', () => {
    const hash = restartsLogsHash(
      'orga_1',
      [
        { appId: 'app_a', deploymentId: 'deployment_x' },
        { appId: 'app_b', deploymentId: 'deployment_y' },
      ],
      new Date('2026-10-21T10:00:00.500Z'),
    );
    expect(hash).toBe(
      '#/orga/orga_1/logs?apps=app_a%2Capp_b&deployments=app_a%3Adeployment_x%2Capp_b%3Adeployment_y&from=2026-10-21T10%3A00%3A00Z',
    );
    const params = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
    expect([...parseRestarts(params.get('deployments'))]).toEqual([
      ['app_a', 'deployment_x'],
      ['app_b', 'deployment_y'],
    ]);
    expect(parseFrom(params.get('from'))?.toISOString()).toBe('2026-10-21T10:00:00.000Z');
  });

  it('leaves out what does not hold together', () => {
    expect([...parseRestarts('app_a:deployment_x,nonsense,app_b:,:deployment_z')]).toEqual([['app_a', 'deployment_x']]);
    expect(parseFrom('not a date')).toBeNull();
    expect(parseFrom(null)).toBeNull();
  });
});
