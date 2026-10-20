import { describe, expect, it } from 'vitest';
import {
  addRow,
  configProviderCommands,
  draftProblems,
  draftVariables,
  hasChanges,
  mergeVariables,
  sameVariables,
  startDraft,
  toggleRemoved,
  updateRow,
  variableChanges,
} from './config-provider.js';

const CURRENT = [
  { name: 'B_URL', value: 'https://b' },
  { name: 'A_TOKEN', value: 'x' },
];

describe('draft', () => {
  it('starts from the current variables, by name, and writes them back unchanged', () => {
    const draft = startDraft(CURRENT);
    expect(draft.map((row) => row.name)).toEqual(['A_TOKEN', 'B_URL']);
    expect(sameVariables(draftVariables(draft), CURRENT)).toBe(true);
  });

  it('edits, adds and strikes out rows', () => {
    let draft = startDraft(CURRENT);
    draft = updateRow(draft, draft[0].key, { value: 'y' });
    draft = toggleRemoved(draft, draft[1].key);
    draft = addRow(draft);
    draft = updateRow(draft, draft[2].key, { name: ' C_FLAG ', value: 'on' });
    expect(draftVariables(draft)).toEqual([
      { name: 'A_TOKEN', value: 'y' },
      { name: 'C_FLAG', value: 'on' },
    ]);
    // A struck variable comes back; an added row just goes.
    expect(draftVariables(toggleRemoved(draft, draft[1].key)).map((variable) => variable.name)).toContain('B_URL');
    expect(toggleRemoved(draft, draft[2].key)).toHaveLength(2);
  });

  it('merges a pasted .env: known names take the new value and come back, others are added', () => {
    let draft = startDraft(CURRENT);
    draft = toggleRemoved(draft, draft[1].key);
    draft = mergeVariables(draft, [
      { name: 'B_URL', value: 'https://c' },
      { name: 'D_NEW', value: '1' },
    ]);
    expect(draftVariables(draft)).toEqual([
      { name: 'A_TOKEN', value: 'x' },
      { name: 'B_URL', value: 'https://c' },
      { name: 'D_NEW', value: '1' },
    ]);
  });

  it('reports names the platform refuses and names used twice, ignoring empty rows', () => {
    let draft = addRow(addRow(addRow(startDraft(CURRENT))));
    draft = updateRow(draft, draft[2].key, { name: '1BAD', value: 'v' });
    draft = updateRow(draft, draft[3].key, { name: 'A_TOKEN', value: 'v' });
    expect(draftProblems(draft)).toEqual([
      { key: draft[2].key, kind: 'name' },
      { key: draft[3].key, kind: 'duplicate' },
    ]);
    expect(draftProblems(updateRow(draft, draft[4].key, { value: 'orphan' }))).toContainEqual({
      key: draft[4].key,
      kind: 'name',
    });
  });
});

describe('changes', () => {
  it('lists what is added, changed and removed, a rename being both', () => {
    const changes = variableChanges(CURRENT, [
      { name: 'A_TOKEN', value: 'y' },
      { name: 'URL', value: 'https://b' },
    ]);
    expect(changes).toEqual({
      added: [{ name: 'URL', value: 'https://b' }],
      changed: [{ name: 'A_TOKEN', value: 'y' }],
      removed: ['B_URL'],
    });
    expect(hasChanges(changes)).toBe(true);
    expect(hasChanges(variableChanges(CURRENT, [...CURRENT].reverse()))).toBe(false);
  });

  it('gives the clever-tools commands, values quoted', () => {
    const changes = variableChanges(CURRENT, [
      { name: 'A_TOKEN', value: 'a b' },
      { name: 'URL', value: 'https://b' },
    ]);
    expect(configProviderCommands('addon_1', changes)).toEqual([
      'clever config-provider set addon_1 URL https://b',
      "clever config-provider set addon_1 A_TOKEN 'a b'",
      'clever config-provider rm addon_1 B_URL',
    ]);
  });
});
