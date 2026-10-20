import { describe, expect, it } from 'vitest';
import { toggleFolded } from './side-cards.js';

describe('side cards', () => {
  it('folds a card, then unfolds it', () => {
    const folded = toggleFolded([], 'watch');
    expect(folded).toEqual(['watch']);
    expect(toggleFolded(toggleFolded(folded, 'recents'), 'watch')).toEqual(['recents']);
  });
});
