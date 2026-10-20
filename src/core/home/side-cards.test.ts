import { describe, expect, it } from 'vitest';
import { toggleFolded } from './side-cards.js';

describe('side cards', () => {
  it('folds a card, then unfolds it', () => {
    const folded = toggleFolded([], 'costs');
    expect(folded).toEqual(['costs']);
    expect(toggleFolded(toggleFolded(folded, 'recents'), 'costs')).toEqual(['recents']);
  });
});
