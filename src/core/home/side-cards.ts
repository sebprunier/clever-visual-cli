/**
 * The cards of the home page's side column that the user folded, the same for
 * every organisation (`cvc.side.folded` in localStorage). A folded card keeps
 * its title and what it counts; the platform status folds by itself when all
 * is well.
 */
export type SideCard = 'watch' | 'recents';

const KEY = 'cvc.side.folded';
const CARDS: readonly SideCard[] = ['watch', 'recents'];

export function readFolded(): SideCard[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? CARDS.filter((card) => parsed.includes(card)) : [];
  } catch {
    return [];
  }
}

export function writeFolded(folded: readonly SideCard[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(folded));
  } catch {
    // Not essential.
  }
}

export function toggleFolded(folded: readonly SideCard[], card: SideCard): SideCard[] {
  return folded.includes(card) ? folded.filter((candidate) => candidate !== card) : [...folded, card];
}
