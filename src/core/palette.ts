/**
 * The command palette model: a flat list of commands, filtered by a query.
 * Phase 1 ships navigation commands; phase 2 adds actions with forms.
 */

export type PaletteGroup = 'Page' | 'Actions' | 'Applications' | 'Organisations' | 'Session';

export interface PaletteCommand {
  id: string;
  title: string;
  subtitle?: string;
  group: PaletteGroup;
  keywords?: string[];
  /** The clever-tools equivalent, shown next to the command when it exists. */
  cli?: string;
  run: () => void;
}

const GROUP_ORDER: PaletteGroup[] = ['Page', 'Actions', 'Applications', 'Organisations', 'Session'];

export function filterCommands(commands: readonly PaletteCommand[], query: string, limit = 50): PaletteCommand[] {
  const terms = normalise(query)
    .split(/\s+/)
    .filter((term) => term.length > 0);
  const scored = commands
    .map((command) => ({ command, score: score(command, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || GROUP_ORDER.indexOf(a.command.group) - GROUP_ORDER.indexOf(b.command.group));
  return scored.slice(0, limit).map(({ command }) => command);
}

function score(command: PaletteCommand, terms: string[]): number {
  if (terms.length === 0) {
    return 1;
  }
  const title = normalise(command.title);
  const haystack = normalise([command.title, command.subtitle ?? '', ...(command.keywords ?? [])].join(' '));
  let total = 0;
  for (const term of terms) {
    if (title.startsWith(term)) {
      total += 5;
    } else if (title.includes(term)) {
      total += 3;
    } else if (haystack.includes(term)) {
      total += 1;
    } else if (isSubsequence(term, title)) {
      total += 0.5;
    } else {
      return 0;
    }
  }
  return total;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
      if (index === needle.length) {
        return true;
      }
    }
  }
  return false;
}

export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
