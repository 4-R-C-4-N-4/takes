// Shared mobility estimate: average squares reached from random squares with 25% of the other
// squares occupied (sliders stop at the first piece, leaps ignore blockers). Seeded and stable.
import { expandPiece, type Piece } from '@takes/library';

export function mobilityOf(piece: Piece, density = 0.25, trials = 4000): number {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const vecs = expandPiece(piece, 'w').filter((v) => v.cond !== 'rank2');
  let total = 0;
  for (let t = 0; t < trials; t++) {
    const from = Math.floor(rand() * 64);
    const occ = new Set<number>();
    for (let s = 0; s < 64; s++) if (s !== from && rand() < density) occ.add(s);
    const seen = new Set<number>();
    for (const v of vecs) {
      const max = v.path === 'leap' ? 1 : Math.min(v.range, 7);
      for (let s = 1; s <= max; s++) {
        const f = (from % 8) + v.dx * s, k = Math.floor(from / 8) + v.dy * s;
        if (f < 0 || f > 7 || k < 0 || k > 7) break;
        const sq = k * 8 + f;
        seen.add(sq);
        if (v.path === 'slide' && occ.has(sq)) break;
      }
    }
    total += seen.size;
  }
  return total / trials;
}
