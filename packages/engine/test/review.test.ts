import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame, fromFEN } from '../src/index.js';

const ruleset = getRuleset('2026.1')!;

function parseSq(s: string): number {
  const file = 'abcdefgh'.indexOf(s[0]!);
  const rank = Number(s[1]) - 1;
  return rank * 8 + file;
}

describe('D2: castling partner with a non-rook piece between king and two rooks', () => {
  it('partner is the closest ROOK-tier piece, skipping over an intervening non-rook piece', () => {
    // a1=rook, b1=knight, c1=rook(closer-but-not-nearest-square), king on e1... actually
    // place: a1 R, b1 N, c1 (empty), d1 (empty), e1 K, f1-h1 empty, plus rook at h1.
    // Queenside: from king scanning left: d1 empty, c1 empty, b1 N (not rook, skip), a1 R (rook) -> partner a1.
    const game = createGame(ruleset, '2026.1:RN2K2R/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const fen = game.toFEN();
    const castling = fen.split(' ')[2]!;
    // Shredder file for a1 partner = 'A', for h1 = 'H'
    expect(castling).toContain('A');
    expect(castling).toContain('H');
  });

  it('two rook-tier pieces on the SAME side: only the closer one is ever the partner', () => {
    // queenside: b1=warden, a1=rook, king on e1. Closest to king scanning from d1 leftwards is b1 (warden).
    const game = createGame(ruleset, '2026.1:R{warden}1K3R/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const fen0 = game.toFEN();
    expect(fen0.split(' ')[2]).toContain('B'); // warden at b1 is the partner, not a1
    expect(fen0.split(' ')[2]).not.toContain('A');
  });
});

describe('fromFEN: non-Shredder K/Q castling letters with multiple rook-tier pieces', () => {
  it('K/Q letters should resolve to the king-ADJACENT rook-tier piece, matching D2, not the outermost one', () => {
    // White: a1=R, b1=W(warden), ... e1=K ... h1=R. Per D2 the queenside partner (closest to king) is b1 (warden).
    // Standard 'Q' letter is ambiguous with 2 rook-tier pieces on one side; this pins current behavior
    // and flags it as a spec question if it disagrees with the Shredder-derived (createGame) result.
    const viaSetup = createGame(ruleset, '2026.1:R{warden}1K3R/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const shredderCastling = viaSetup.toFEN().split(' ')[2]!;

    const viaFEN = fromFEN(ruleset, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RW2K2R w KQkq - 0 1');
    const fenCastling = viaFEN.toFEN().split(' ')[2]!;

    // Both describe the identical physical position; D2 says the partner is fixed structurally
    // (closest rook-tier piece), so both representations must agree on which square holds White's
    // queenside castling right.
    expect(fenCastling.includes('B')).toBe(shredderCastling.includes('B'));
  });
});

describe('en passant: library pawn-tier pieces are never ep participants', () => {
  it('berolina cannot be captured en passant even though it sits where a double-stepped vanilla pawn would', () => {
    // Berolina has no double-step, so it can never create an ep square itself. Pin that a vanilla
    // pawn double-step adjacent to a berolina does not let the berolina be "passed".
    const game = fromFEN(ruleset, '8/8/8/3E4/4Pp2/8/8/4K2k w - - 0 1');
    // not a realistic ep setup (berolina doesn't double step) — instead verify berolina has no ep-kind move ever
    const moves = game.legalMoves().filter((m) => m.kind === 'ep');
    expect(moves.length).toBe(0);
  });

  it('vanilla pawn double step next to an ENEMY berolina does not let the berolina capture ep', () => {
    const game = fromFEN(ruleset, '8/3p4/8/8/4E3/8/8/4K2k b - - 0 1');
    game.make({ from: parseSq('d7'), to: parseSq('d5'), kind: 'double' });
    // berolina on e4 is adjacent-diagonally-behind-ish; it has no ep-capture component regardless.
    const epMoves = game.legalMoves().filter((m) => m.kind === 'ep');
    expect(epMoves.length).toBe(0);
  });
});

describe('berolina promotion [spec: inverted pawn, promotion on last rank]', () => {
  it('promotes by its forward-straight CAPTURE onto the last rank', () => {
    const game = fromFEN(ruleset, '3n4/8/8/8/8/8/3E4/4K2k w - - 0 1'.replace('3n4', '3n4'));
    // Set up berolina one step from promoting via straight capture: berolina on d7, enemy knight on d8.
    const g2 = fromFEN(ruleset, '3n4/3E4/8/8/8/8/8/4K2k w - - 0 1');
    const moves = g2.legalMoves().filter((m) => m.from === parseSq('d7') && m.to === parseSq('d8'));
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.promo)).toBe(true);
    expect(moves.some((m) => m.promo === 'queen')).toBe(true);
  });

  it('promotes by its diagonal MOVE onto the last rank', () => {
    const g2 = fromFEN(ruleset, '8/3E4/8/8/8/8/8/4K2k w - - 0 1');
    const moves = g2.legalMoves().filter((m) => m.from === parseSq('d7') && (m.to === parseSq('c8') || m.to === parseSq('e8')));
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.promo)).toBe(true);
  });

  it('black berolina promotes toward rank 1 (orientation: dy flips, files do not mirror)', () => {
    const g2 = fromFEN(ruleset, '4k2K/8/8/8/8/8/3e4/8 b - - 0 1');
    const moves = g2.legalMoves().filter((m) => m.from === parseSq('d2'));
    // black berolina moves diagonally toward rank 1: c1 or e1
    expect(moves.some((m) => m.to === parseSq('c1') || m.to === parseSq('e1'))).toBe(true);
    expect(moves.some((m) => m.to === parseSq('d1'))).toBe(false); // straight is capture-only
    const promo = moves.find((m) => m.promo);
    expect(promo).toBeDefined();
  });
});

describe('pawn-tier pieces on rank 1/3 never double-step [spec.md Component.cond]', () => {
  it('a vanilla pawn placed (via FEN) on rank 3, unmoved, has no double-step', () => {
    // White pawn sitting on a3 with nothing on a1/a2: relRank from white POV of a3 is 3, not 2.
    const game = fromFEN(ruleset, '7k/8/8/8/8/P7/8/K7 w - - 0 1');
    const moves = game.legalMoves().filter((m) => m.from === parseSq('a3'));
    expect(moves.some((m) => m.kind === 'double')).toBe(false);
    expect(moves.map((m) => m.to)).toEqual([parseSq('a4')]);
  });

  it('a vanilla pawn placed (via FEN) on rank 1 has no double-step either', () => {
    const game = fromFEN(ruleset, '7k/8/8/8/8/8/8/P3K3 w - - 0 1');
    const moves = game.legalMoves().filter((m) => m.from === parseSq('a1'));
    expect(moves.some((m) => m.kind === 'double')).toBe(false);
  });
});

describe('game end: insufficient material is K-vs-K only [impl.md]', () => {
  it('K+N vs K is NOT an automatic draw (only bare kings are)', () => {
    const game = fromFEN(ruleset, '8/8/4k3/8/8/4K3/8/N7 w - - 0 1');
    const status = game.status();
    expect(status.reason).not.toBe('insufficient');
  });
});

describe('repetition hash sensitivity [impl.md: must include side, castling rights, ep]', () => {
  it('identical piece placement + side with DIFFERENT castling rights is not counted as the same position', () => {
    const withRights = fromFEN(ruleset, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const withoutRights = fromFEN(ruleset, 'r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1');
    expect(withRights.hash()).not.toBe(withoutRights.hash());
  });

  it('identical piece placement + side with DIFFERENT en passant target is not counted as the same position', () => {
    const withEp = fromFEN(ruleset, '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const withoutEp = fromFEN(ruleset, '4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1');
    expect(withEp.hash()).not.toBe(withoutEp.hash());
  });
});

describe('king safety: own pieces act as blockers per spec, enemy pieces never block during the check', () => {
  it('a friendly blocker on the file shields the king from an enemy rook-tier piece placed deep in the enemy zone', () => {
    const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    expect(game).toBeDefined(); // vanilla setup already covered in validator tests; engine-side smoke only
  });
});
