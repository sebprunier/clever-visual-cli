import { describe, expect, it } from 'vitest';
import { filterCommands, type PaletteCommand } from './palette.js';

const noop = () => {};
const commands: PaletteCommand[] = [
  { id: 'app-1', title: 'api-gateway', subtitle: 'SERLI · node', group: 'Applications', run: noop },
  { id: 'app-2', title: 'Front Démo', subtitle: 'MAIF · static', group: 'Applications', run: noop },
  { id: 'orga-1', title: 'SERLI', group: 'Organisations', run: noop },
  { id: 'logs', title: 'Logs', group: 'Page', keywords: ['journal'], cli: 'clever logs', run: noop },
  { id: 'logout', title: 'Se déconnecter', group: 'Session', run: noop },
];

describe('palette filtering', () => {
  it('returns everything, grouped, for an empty query', () => {
    expect(filterCommands(commands, '').map((c) => c.id)).toEqual(['logs', 'app-1', 'app-2', 'orga-1', 'logout']);
  });

  it('ranks title prefixes above substring and keyword matches', () => {
    expect(filterCommands(commands, 'serli').map((c) => c.id)).toEqual(['orga-1', 'app-1']);
  });

  it('ignores accents and case', () => {
    expect(filterCommands(commands, 'demo').map((c) => c.id)).toEqual(['app-2']);
    expect(filterCommands(commands, 'DÉCONNECTER').map((c) => c.id)).toEqual(['logout']);
  });

  it('matches keywords and subsequences', () => {
    expect(filterCommands(commands, 'journal').map((c) => c.id)).toEqual(['logs']);
    expect(filterCommands(commands, 'agw').map((c) => c.id)).toEqual(['app-1']);
  });

  it('requires every term to match', () => {
    expect(filterCommands(commands, 'api maif')).toEqual([]);
    expect(filterCommands(commands, 'front maif').map((c) => c.id)).toEqual(['app-2']);
  });
});
