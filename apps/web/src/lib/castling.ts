// Castling-hint computation: for a 3-rank setup, find the king on rank 1 and the
// closest rook-tier piece on each side of it on rank 1 [impl.md "Castling"].
import type { Ruleset } from '@takes/library';
import { KING_ID } from '@takes/library';
import type { Setup } from '@takes/library';

export interface CastlingHint {
  kingFile: number | null;
  /** File index of the kingside (h-side) castling partner, or null. */
  kingsidePartnerFile: number | null;
  /** File index of the queenside (a-side) castling partner, or null. */
  queensidePartnerFile: number | null;
}

export function computeCastlingHints(setup: Setup, ruleset: Ruleset): CastlingHint {
  const rank1 = setup.ranks[0] ?? [];
  let kingFile: number | null = null;
  for (let f = 0; f < 8; f++) if (rank1[f] === KING_ID) kingFile = f;

  const isRookTier = (id: string | null): boolean => {
    if (!id || id === KING_ID) return false;
    const p = ruleset.pieces[id];
    return p?.tier === 'rook';
  };

  let kingsidePartnerFile: number | null = null;
  let queensidePartnerFile: number | null = null;
  if (kingFile !== null) {
    for (let f = kingFile + 1; f < 8; f++) {
      if (isRookTier(rank1[f] ?? null)) { kingsidePartnerFile = f; break; }
    }
    for (let f = kingFile - 1; f >= 0; f--) {
      if (isRookTier(rank1[f] ?? null)) { queensidePartnerFile = f; break; }
    }
  }
  return { kingFile, kingsidePartnerFile, queensidePartnerFile };
}
