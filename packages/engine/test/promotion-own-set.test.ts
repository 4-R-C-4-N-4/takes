import { describe, expect, it } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame } from '../src/index.js';

// Own-set promotion [D6]: a pawn-tier piece may only become a non-pawn piece from its own side's
// STARTING army, fixed at game start (captures later in the game don't change the list).
describe('own-set promotion targets (2026.3)', () => {
  const r = getRuleset('2026.3')!;

  it('offers each side only its own starting non-pawn, non-king pieces', () => {
    const g = createGame(r, '2026.3:R1B{bane}KB1R/PPPPPPPP/8', '2026.3:R{halo}B1KB{jester}R/PPPPPPPP/8');
    expect(g.promotionTargets('w').sort()).toEqual(['bane', 'bishop', 'rook']);
    expect(g.promotionTargets('b').sort()).toEqual(['bishop', 'halo', 'jester', 'rook']);
  });

  it('never offers the opponent\'s pieces or pawn-tier pieces, and generated promotions match', () => {
    const g = createGame(r, '2026.3:R{octopus}B1KB{turtle}R/PPP{triton}{triton}PPP/8', '2026.3:RNBQKBNR/PPPPPPPP/8');
    const w = g.promotionTargets('w');
    expect(w.sort()).toEqual(['bishop', 'octopus', 'rook', 'turtle']);
    expect(w).not.toContain('queen');
    expect(w).not.toContain('triton');
  });

  it('every promotion the engine generates during play uses only the mover\'s own starting pieces', () => {
    // Seeded random playouts until promotions actually show up in the legal move list (Tritons
    // slide three squares, so they reach the last rank quickly), for both colours.
    let seed = 20261028;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const seen = { w: new Set<string>(), b: new Set<string>() };
    for (let gameNo = 0; gameNo < 200 && (seen.w.size === 0 || seen.b.size === 0); gameNo++) {
      const g = createGame(r, '2026.3:R{octopus}B1KB{turtle}R/PPP{triton}{triton}PPP/8', '2026.3:R{halo}B1KB{jester}R/PP{sai}{sai}PPPP/8');
      for (let ply = 0; ply < 120 && g.status().result === '*'; ply++) {
        const moves = g.legalMoves();
        if (!moves.length) break;
        const side = g.sideToMove();
        for (const m of moves) if (m.promo) {
          expect(g.promotionTargets(side), `${side} promoted to ${m.promo}`).toContain(m.promo);
          seen[side].add(m.promo);
        }
        g.make(moves[Math.floor(rand() * moves.length)]!);
      }
    }
    expect([...seen.w].sort()).toEqual(['bishop', 'octopus', 'rook', 'turtle']);
    expect([...seen.b].sort()).toEqual(['bishop', 'halo', 'jester', 'rook']);
  });

  it('falls back to the ruleset fallback when an army has no non-pawn pieces', () => {
    const g = createGame(r, '2026.3:4K3/PPPPPPPP/8', '2026.3:RNBQKBNR/PPPPPPPP/8');
    expect(g.promotionTargets('w')).toEqual(r.promotionFallback);
  });
});
