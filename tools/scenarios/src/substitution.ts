/** Same-tier substitution [req. 1]: picks the reference id(s)/count to swap for the candidate,
 * reusing @takes/valuation's setup helpers (classicSetup/substitute/str). */
import type { Ruleset, Tier } from '@takes/library';
import { parseSetup } from '@takes/library';
import { classicSetup, substitute, str } from '@takes/valuation';
import { randomProfile, mulberry32 } from '@takes/perft';

export interface TierSubstitution {
  referenceId: string;
  count: number;
}

/** Reference piece + copy count per tier, per req.1: pawn-tier replaces pawns (1 or 3 copies),
 * minor replaces knight or bishop, rook replaces rook, major replaces queen. */
export function tierSubstitution(tier: Tier, variant: 0 | 1 = 0): TierSubstitution {
  switch (tier) {
    case 'pawn': return { referenceId: 'pawn', count: variant === 0 ? 1 : 3 };
    case 'minor': return { referenceId: variant === 0 ? 'knight' : 'bishop', count: 1 };
    case 'rook': return { referenceId: 'rook', count: 1 };
    case 'major': return { referenceId: 'queen', count: 1 };
    default: throw new Error(`unknown tier: ${tier}`);
  }
}

/** Replaces `count` copies of fromId with toId in a setup, reusing valuation's substitute(). */
function replaceCopies<T extends { ranks: Array<Array<string | null>>; version: string }>(setup: T, fromId: string, toId: string, count: number): T {
  let s = setup;
  for (let i = 0; i < count; i++) s = substitute(s, fromId, toId) as T;
  return s;
}

/** Builds the candidate army for one game: a classic-like setup or a random valid profile that
 * contains the reference piece, with `count` copies substituted for the candidate. Falls back to
 * classic if the random profile (after `tries` attempts) never contains enough reference copies. */
export function buildCandidateArmy(
  r: Ruleset,
  candidateId: string,
  sub: TierSubstitution,
  useRandom: boolean,
  seed: number,
): string {
  if (!useRandom) {
    const base = classicSetup(r.version);
    return str(replaceCopies(base, sub.referenceId, candidateId, sub.count));
  }
  const rand = mulberry32(seed);
  for (let t = 0; t < 200; t++) {
    const candidateStr = randomProfile(r, rand, 50);
    const setup = parseSetup(candidateStr);
    const refCount = setup.ranks.flat().filter((id: string | null) => id === sub.referenceId).length;
    if (refCount >= sub.count) return str(replaceCopies(setup, sub.referenceId, candidateId, sub.count));
  }
  // Could not find a random profile with enough copies of the reference piece — fall back to classic.
  const base = classicSetup(r.version);
  return str(replaceCopies(base, sub.referenceId, candidateId, sub.count));
}
