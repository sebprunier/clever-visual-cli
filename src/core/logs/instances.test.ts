import { describe, expect, it } from 'vitest';
import type { Deployment, Instance } from '../../data/api.js';
import {
  assignHues,
  byCreation,
  countLines,
  fromApi,
  groupInstances,
  inSelection,
  instancesCommand,
  keepAvailable,
  parseSelection,
  selectionParam,
  unknownInstance,
  unlisted,
} from './instances.js';

const instance = (id: string, deploymentId: string, fields: Partial<Instance> = {}): Instance => ({
  id,
  applicationId: 'app_1',
  deploymentId,
  name: `Instance ${id}`,
  flavor: 'S',
  index: 0,
  state: 'UP',
  hypervisorId: 'hv',
  createdAt: '2026-11-16T14:00:00.000Z',
  isBuildVm: false,
  ...fields,
});

const deployment = (id: string, index: number, date: string): Deployment => ({
  id,
  applicationId: 'app_1',
  index,
  date,
  state: 'SUCCEEDED',
  action: 'DEPLOY',
  commit: '00b4a01ca8d2',
  instances: 1,
  author: { name: 'someone' },
});

// The case of #38: the previous instance, a deployment with a build and a run instance, the current one.
const previous = fromApi(
  instance('old', 'dep_1', {
    createdAt: '2026-10-23T09:00:00.000Z',
    state: 'DELETED',
    deletedAt: '2026-11-16T14:50:50.000Z',
  }),
);
const build = fromApi(instance('build', 'dep_2', { createdAt: '2026-11-16T14:40:00.000Z', isBuildVm: true }));
const replaced = fromApi(instance('run', 'dep_2', { createdAt: '2026-11-16T14:45:00.000Z', state: 'DELETED' }));
const current = fromApi(instance('new', 'dep_3', { createdAt: '2026-11-16T14:48:00.000Z' }));

describe('instances of the logs', () => {
  it('group by deployment, the newest first, the build instance first and then by number', () => {
    const second = fromApi(instance('run-1', 'dep_2', { index: 1, createdAt: '2026-11-16T14:45:01.000Z' }));
    const deployments = new Map([
      ['dep_1', deployment('dep_1', 41, '2026-10-23T08:58:00.000Z')],
      ['dep_2', deployment('dep_2', 42, '2026-11-16T14:39:00.000Z')],
    ]);
    // dep_3 is not among the deployments read: its first instance dates it.
    const groups = groupInstances([previous, second, current, replaced, build], deployments);
    expect(groups.map((group) => group.deploymentId)).toEqual(['dep_3', 'dep_2', 'dep_1']);
    expect(groups[0].deployment).toBeNull();
    expect(groups[1].deployment?.index).toBe(42);
    expect(groups[1].instances.map((item) => item.id)).toEqual(['build', 'run', 'run-1']);
  });

  it('put the instances of no known deployment last', () => {
    const groups = groupInstances([unknownInstance('ghost'), current], new Map());
    expect(groups.map((group) => group.deploymentId)).toEqual(['dep_3', '']);
    expect(groups[1].instances[0]).toMatchObject({ id: 'ghost', state: null, name: null });
  });

  it('count the lines of each instance and tell the ones not listed yet', () => {
    const lines = [{ instanceId: 'old' }, { instanceId: 'new' }, { instanceId: 'old' }, { instanceId: 'ghost' }, {}];
    const counts = countLines(lines);
    expect([...counts]).toEqual([
      ['old', 2],
      ['new', 1],
      ['ghost', 1],
    ]);
    expect(unlisted(counts, new Map([previous, current].map((item) => [item.id, item])))).toEqual(['ghost']);
  });

  it('tell the instances of the last 24 hours that the window leaves out', () => {
    // 15 minutes after a redeployment: the current instance only; the last 24 hours add the
    // build instance and the previous one, both deleted before the window.
    const shown = new Map([[current.id, current]]);
    const day = new Map([previous, build, current].map((item) => [item.id, item]));
    expect(unlisted(day, shown)).toEqual(['old', 'build']);
    expect(unlisted(shown, shown)).toEqual([]);
  });

  it('keep the colour of each instance as new ones come', () => {
    const first = assignHues(new Map(), byCreation([current, previous]), 'app_1');
    expect([...first.keys()]).toEqual(['old', 'new']);
    const later = assignHues(first, byCreation([unknownInstance('ghost'), current, previous, build]), 'app_1');
    expect(later.get('old')).toBe(first.get('old'));
    expect(later.get('new')).toBe(first.get('new'));
    expect([...later.keys()]).toEqual(['old', 'new', 'build', 'ghost']);
    expect(new Set(later.values()).size).toBe(4);
  });

  it('read and write the selection of the address', () => {
    const selection = parseSelection(' new,old,,new ');
    expect([...selection]).toEqual(['new', 'old']);
    expect(selectionParam(selection)).toBe('new,old');
    expect(selectionParam(new Set())).toBeNull();
    expect(parseSelection(null).size).toBe(0);
  });

  it('drop the ids no longer in the window, and keep the same set when none goes', () => {
    const available = new Map([current, previous].map((item) => [item.id, item]));
    const selection = new Set(['new', 'old']);
    expect(keepAvailable(selection, available)).toBe(selection);
    expect([...keepAvailable(new Set(['new', 'gone']), available)]).toEqual(['new']);
  });

  it('show every line when nothing is selected, and the selected instances only otherwise', () => {
    const lines = [
      { instanceId: 'old', message: '[error] exporter' },
      { instanceId: 'new', message: '[warn] vaults' },
    ];
    expect(lines.filter((line) => inSelection(new Set(), line))).toHaveLength(2);
    expect(lines.filter((line) => inSelection(new Set(['old']), line)).map((line) => line.message)).toEqual([
      '[error] exporter',
    ]);
    // Combined with the text filter, as the tab does.
    const shown = lines.filter((line) => inSelection(new Set(['new']), line) && line.message.includes('error'));
    expect(shown).toHaveLength(0);
  });

  it('give the clever-tools command of the same list', () => {
    expect(instancesCommand('app_1', { since: '15m' })).toBe('clever instances --app app_1 --since 15m');
    expect(instancesCommand('app_1', { since: 'now' })).toBe('clever instances --app app_1');
    expect(instancesCommand('app_1', { deploymentId: 'deployment_9' })).toBe(
      'clever instances --app app_1 --deployment-id deployment_9',
    );
  });
});
