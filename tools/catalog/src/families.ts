/** Tier heuristic and family tags [docs/catalog/PLAN.md step 3]. */
import type { Piece, Tier } from '@takes/library';
import { expandPiece } from '@takes/library';
import { isCastlingEligible, validatePiece, hasErrors } from '@takes/validator';
import type { Family, StaticProfile } from './types.js';

/** Try each tier in priority order (pawn > rook > major > minor) and keep the first that validates clean. */
export function assignTier(piece: Piece, queenMobilityAvg: number, mobilityAvg: number): Tier {
  const asPawn: Piece = { ...piece, tier: 'pawn' };
  if (!hasErrors(validatePiece(asPawn))) return 'pawn';
  if (isCastlingEligible(piece)) return 'rook';
  if (mobilityAvg >= 0.75 * queenMobilityAvg) return 'major';
  return 'minor';
}

export function assignFamilies(piece: Piece, profile: StaticProfile): Family[] {
  const families: Family[] = [];
  if (profile.hasSlide && !profile.hasLeap) families.push('slider');
  if (profile.hasLeap && !profile.hasSlide) families.push('leaper');
  if (profile.hasSlide && profile.hasLeap) families.push('step-leap');
  if (!profile.hasLeap && piece.components.every((c) => c.range === 1)) families.push('stepper');
  if (profile.hasSlide && piece.components.some((c) => c.range === Infinity) && profile.hasLeap) families.push('slide-leap');
  if (profile.splitMoveCapture) families.push('split');
  const vectors = expandPiece(piece, 'w');
  const allForward = vectors.length > 0 && vectors.every((v) => v.dy >= 1);
  if (allForward) families.push('forward');
  if (piece.tier === 'pawn') families.push('pawnlike');
  if (profile.canSidestep && !allForward) families.push('sideways');
  return families.length ? families : ['stepper'];
}
