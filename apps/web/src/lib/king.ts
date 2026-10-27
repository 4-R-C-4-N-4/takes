// Synthetic king piece: the engine king is not in the ruleset (impl.md), so the UI
// defines its own Piece-shaped object to reuse @takes/art's pieceSvg/badgeSvg.
import type { Piece } from '@takes/library';

export const KING_PIECE: Piece = {
  id: 'king',
  name: 'King',
  glyph: 'K',
  tier: 'major',
  components: [
    { vec: [1, 0], sym: 'all', range: 1, path: 'slide', mode: 'both' },
    { vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
  ],
};
