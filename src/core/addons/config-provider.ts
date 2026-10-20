/**
 * Editing the variables of a configuration provider. Its API replaces the
 * whole list at once, so the tab edits a draft of it (rows renamed, changed,
 * added or struck out) and writes it in one go. What changes is listed with
 * the clever-tools commands that would do the same one variable at a time.
 */
import { ENV_NAME_PATTERN } from '../env.js';
import { shellQuote } from '../shell.js';

export interface Variable {
  name: string;
  value: string;
}

export interface DraftRow {
  /** Stable while the name is edited, for the rendering. */
  key: string;
  name: string;
  value: string;
  removed: boolean;
  /** The variable the row started from, null for an added one. */
  original: Variable | null;
}

let lastKey = 0;
const nextKey = () => `row-${++lastKey}`;

export function startDraft(variables: readonly Variable[]): DraftRow[] {
  return [...variables]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((variable) => ({ key: nextKey(), ...variable, removed: false, original: variable }));
}

export function addRow(draft: readonly DraftRow[]): DraftRow[] {
  return [...draft, { key: nextKey(), name: '', value: '', removed: false, original: null }];
}

export function updateRow(draft: readonly DraftRow[], key: string, patch: Partial<Variable>): DraftRow[] {
  return draft.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

/** Strikes a variable out, or brings it back; a row added in the draft just goes. */
export function toggleRemoved(draft: readonly DraftRow[], key: string): DraftRow[] {
  return draft
    .filter((row) => row.key !== key || row.original != null)
    .map((row) => (row.key === key ? { ...row, removed: !row.removed } : row));
}

/** A pasted `.env`: a name already in the draft takes the new value (and comes back if struck), others are added. */
export function mergeVariables(draft: readonly DraftRow[], variables: readonly Variable[]): DraftRow[] {
  let next = [...draft];
  for (const variable of variables) {
    const existing = next.find((row) => row.name === variable.name);
    next =
      existing == null
        ? [...next, { key: nextKey(), ...variable, removed: false, original: null }]
        : next.map((row) => (row === existing ? { ...row, value: variable.value, removed: false } : row));
  }
  return next;
}

/** The list the draft would write: kept rows with a name, by name. */
export function draftVariables(draft: readonly DraftRow[]): Variable[] {
  return draft
    .filter((row) => !row.removed && row.name.trim() !== '')
    .map((row) => ({ name: row.name.trim(), value: row.value }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface DraftProblem {
  key: string;
  kind: 'name' | 'duplicate';
}

/** Rows that cannot be written: a name the platform refuses (or none, with a value), a name used twice. */
export function draftProblems(draft: readonly DraftRow[]): DraftProblem[] {
  const kept = draft.filter((row) => !row.removed && (row.name.trim() !== '' || row.value !== ''));
  const problems: DraftProblem[] = [];
  const seen = new Set<string>();
  for (const row of kept) {
    const name = row.name.trim();
    if (!ENV_NAME_PATTERN.test(name)) {
      problems.push({ key: row.key, kind: 'name' });
    } else if (seen.has(name)) {
      problems.push({ key: row.key, kind: 'duplicate' });
    }
    seen.add(name);
  }
  return problems;
}

export interface VariableChanges {
  added: Variable[];
  changed: Variable[];
  removed: string[];
}

/** By name: a renamed variable is one removed and one added. */
export function variableChanges(before: readonly Variable[], after: readonly Variable[]): VariableChanges {
  const previous = new Map(before.map((variable) => [variable.name, variable.value]));
  const next = new Set(after.map((variable) => variable.name));
  return {
    added: after.filter((variable) => !previous.has(variable.name)),
    changed: after.filter((variable) => previous.has(variable.name) && previous.get(variable.name) !== variable.value),
    removed: before.filter((variable) => !next.has(variable.name)).map((variable) => variable.name),
  };
}

export function hasChanges(changes: VariableChanges): boolean {
  return changes.added.length + changes.changed.length + changes.removed.length > 0;
}

/** `clever config-provider set|rm`, one variable at a time, for what the single write does. */
export function configProviderCommands(addonId: string, changes: VariableChanges): string[] {
  return [
    ...[...changes.added, ...changes.changed].map(
      (variable) => `clever config-provider set ${addonId} ${variable.name} ${shellQuote(variable.value)}`,
    ),
    ...changes.removed.map((name) => `clever config-provider rm ${addonId} ${name}`),
  ];
}

/** The same variables whatever the order: nobody changed the list since it was read. */
export function sameVariables(a: readonly Variable[], b: readonly Variable[]): boolean {
  return !hasChanges(variableChanges(a, b));
}
