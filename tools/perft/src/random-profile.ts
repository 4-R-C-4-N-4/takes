/** Seeded random VALID profile generator (tools only; randomness is fine outside the engine). */
import type { Ruleset } from '@takes/library';
import { serializeSetup } from '@takes/library';
import { validateProfile, hasErrors } from '@takes/validator';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random setup that passes validateProfile for both colors. Biased toward realistic armies:
 * a shield of pawn-tier pieces in front of the king (needed for king safety) plus random officers.
 */
export function randomProfile(r: Ruleset, rand: () => number, maxTries = 2000): string {
  const ids = Object.keys(r.pieces);
  const pawnTier = ids.filter((id) => r.pieces[id]!.tier === 'pawn');
  const officers = ids.filter((id) => r.pieces[id]!.tier !== 'pawn');
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;
  for (let t = 0; t < maxTries; t++) {
    const ranks: Array<Array<string | null>> = [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)];
    const kf = Math.floor(rand() * 8);
    ranks[0]![kf] = 'king';
    let budget = r.pool;
    const counts: Record<string, number> = {};
    const place = (ri: number, f: number, id: string) => {
      const c = r.costs[id]!; const cap = r.maxCount[id];
      if (c > budget || ranks[ri]![f] !== null || (cap !== undefined && (counts[id] ?? 0) >= cap)) return;
      ranks[ri]![f] = id; budget -= c; counts[id] = (counts[id] ?? 0) + 1;
    };
    // pawn shield on rank 2 with some holes / rank-3 pawns
    for (let f = 0; f < 8; f++) { const roll = rand(); if (roll < 0.75) place(1, f, pick(pawnTier)); else if (roll < 0.85) place(2, f, pick(pawnTier)); }
    // officers on remaining squares
    const squares: Array<[number, number]> = [];
    for (let ri = 0; ri < 3; ri++) for (let f = 0; f < 8; f++) squares.push([ri, f]);
    for (let i = squares.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [squares[i], squares[j]] = [squares[j]!, squares[i]!]; }
    for (const [ri, f] of squares) { if (rand() < 0.5) place(ri, f, pick(officers)); }
    const s = serializeSetup({ version: r.version, ranks });
    if (!hasErrors(validateProfile(s, r, { color: 'w' })) && !hasErrors(validateProfile(s, r, { color: 'b' }))) return s;
  }
  throw new Error('could not generate a valid profile');
}
