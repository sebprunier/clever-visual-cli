import { describe, expect, it } from 'vitest';
import type { Instance } from '../../data/api.js';
import { sshInstances, sshRun, sshSession, sshTarget } from './ssh.js';

function instance(id: string, overrides: Partial<Instance> = {}): Instance {
  return {
    id,
    applicationId: 'app_1',
    deploymentId: 'deployment_1',
    state: 'UP',
    hypervisorId: 'hv',
    createdAt: '2026-11-09T10:00:00Z',
    isBuildVm: false,
    index: 0,
    ...overrides,
  };
}

describe('sshSession', () => {
  it('opens a session, on one instance when asked', () => {
    expect(sshSession('app_1')).toBe('clever ssh --app app_1');
    expect(sshSession('app_1', '2')).toBe('clever ssh --app app_1 --instance 2');
  });
});

describe('sshInstances', () => {
  it('keeps the running VMs, build instances last, by number, the newest first', () => {
    const list = sshInstances([
      instance('build', { isBuildVm: true, state: 'BUILDING' }),
      instance('two', { index: 2 }),
      instance('gone', { state: 'DELETED' }),
      instance('ghost', { state: 'GHOST' }),
      instance('old', { index: 1, createdAt: '2026-11-09T09:00:00Z' }),
      instance('new', { index: 1, createdAt: '2026-11-09T11:00:00Z' }),
      instance('unnumbered', { index: undefined, state: 'BOOTING' }),
    ]);
    expect(list.map((entry) => entry.id)).toEqual(['new', 'old', 'two', 'unnumbered', 'build']);
  });
});

describe('sshTarget', () => {
  it('uses the number when it is enough', () => {
    const running = [instance('a', { index: 0 }), instance('b', { index: 1 })];
    expect(sshTarget(running[1], running)).toBe('1');
  });

  it('uses the id of a build instance, which a number never picks', () => {
    const running = [instance('a', { index: 0 }), instance('build', { index: 0, isBuildVm: true })];
    expect(sshTarget(running[1], running)).toBe('build');
    expect(sshTarget(running[0], running)).toBe('0');
  });

  it('uses the id when a rolling deployment has two instances on one number', () => {
    const running = [instance('leaving', { index: 0 }), instance('coming', { index: 0 })];
    expect(running.map((entry) => sshTarget(entry, running))).toEqual(['leaving', 'coming']);
  });

  it('uses the id before the instance has a number', () => {
    const running = [instance('booting', { index: undefined })];
    expect(sshTarget(running[0], running)).toBe('booting');
  });
});

describe('sshRun', () => {
  it('runs one command from the application folder', () => {
    expect(sshRun('app_1', 'hostname', false)).toBe('clever ssh --app app_1 --instance any --app-home -c hostname');
  });

  it('leaves out --app-home for Docker, which clever-tools refuses', () => {
    expect(sshRun('app_1', 'hostname', true)).toBe('clever ssh --app app_1 --instance any -c hostname');
  });

  it('keeps a command in one shell word, spaces, quotes and $ included', () => {
    expect(sshRun('app_1', `echo "$HOME" it's`, false)).toBe(
      `clever ssh --app app_1 --instance any --app-home -c 'echo "$HOME" it'\\''s'`,
    );
  });
});
