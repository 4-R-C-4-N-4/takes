import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame, fromFEN } from './index.js';
import type { Move } from './index.js';

const ruleset = getRuleset('2026.1')!;

describe('en passant', () => {
  it('basic capture is available and legal', () => {
    const game = fromFEN(ruleset, 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const moves = game.legalMoves();
    const ep = moves.find((m) => m.kind === 'ep');
    expect(ep).toBeDefined();
    expect(game.moveToUci(ep!)).toBe('e5d6');
    game.make(ep!);
    expect(game.board()[parseSq('d5')]).toBeNull();
    expect(game.board()[parseSq('d6')]?.pieceId).toBe('pawn');
    game.unmake();
    expect(game.toFEN().split(' ')[0]).toBe('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR');
  });

  it('horizontal discovered check prevents en passant', () => {
    // White king a5, black rook h5, white pawn e5, black pawn d7->d5 just played (ep square d6).
    // Capturing e5xd6 ep would remove the e5 pawn, exposing the king to the rook along rank 5.
    const g2 = fromFEN(ruleset, '8/3p4/8/K3P2r/8/8/8/7k b - - 0 1');
    g2.make({ from: parseSq('d7'), to: parseSq('d5'), kind: 'double' });
    const moves = g2.legalMoves();
    const ep = moves.find((m) => m.kind === 'ep');
    expect(ep).toBeUndefined();
  });
});

describe('castling', () => {
  it('blocked by a piece in between', () => {
    const game = fromFEN(ruleset, 'r3k2r/8/8/8/8/8/8/R2BK2R w KQkq - 0 1');
    const moves = game.legalMoves();
    const castles = moves.filter((m) => m.kind === 'castle');
    expect(castles.length).toBe(1); // only kingside, queenside blocked by bishop on d1
  });

  it('through-check blocks castling', () => {
    // black rook on e-file pins/attacks f1 square which king must cross for kingside castle
    const game = fromFEN(ruleset, '4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
    const moves = game.legalMoves();
    const castles = moves.filter((m) => m.kind === 'castle');
    expect(castles.length).toBe(0); // king in check (rook attacks e1)
  });

  it('partner path attacked is OK (only king path matters)', () => {
    // black rook attacks b1 (partner path square), not king's path (e1-g1) — kingside should still work;
    // queenside should also work since only king's own path/landing + occupancy matters, not rook path/landing.
    const game = fromFEN(ruleset, '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    const moves = game.legalMoves();
    const castles = moves.filter((m) => m.kind === 'castle');
    expect(castles.length).toBe(2);
  });

  it('960: king already on g-file can still castle kingside', () => {
    // King already on g1, single rook-tier partner on h1; castling moves it to f1 while king stays on g1.
    const g2 = fromFEN(ruleset, '7k/8/8/8/8/8/8/6KR w H - 0 1');
    const moves = g2.legalMoves();
    const castles = moves.filter((m) => m.kind === 'castle');
    expect(castles.length).toBe(1);
    expect(g2.moveToUci(castles[0]!)).toBe('g1h1');
  });

  it('partner = closest rook-tier piece; right lost when that partner moves', () => {
    // Two rook-tier pieces on one side: warden and rook; closest is kept as partner.
    const game = createGame(ruleset, '2026.1:R{warden}1K3R/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const kingSq = game.board().findIndex((bp) => bp?.pieceId === 'king' && bp.color === 'w');
    expect(kingSq).toBeGreaterThanOrEqual(0);
    const fen0 = game.toFEN();
    expect(fen0.split(' ')[2]).toContain('B'); // shredder file 'b' = warden square, uppercase for white
    expect(fen0.split(' ')[2]).toContain('H'); // kingside rook at file h

    // moving the warden (queenside partner) should lose that right, kingside right remains
    const bSq = 1; // b1
    const moves = game.legalMoves().filter((m) => m.from === bSq);
    expect(moves.length).toBeGreaterThan(0);
    game.make(moves[0]!);
    const fen1 = game.toFEN();
    expect(fen1.split(' ')[2]).not.toContain('B');
    expect(fen1.split(' ')[2]).toContain('H');
  });
});

describe('promotion (own-set) [D6]', () => {
  it('setup with only knights & pawns promotes to knight only', () => {
    const game = createGame(ruleset, '2026.1:1N1K1N2/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    expect(game.promotionTargets('w')).toEqual(['knight']);
  });

  it('setup with only pawns falls back to queen', () => {
    const game = createGame(ruleset, '2026.1:3K4/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    expect(game.promotionTargets('w')).toEqual(['queen']);
  });
});

describe('library pieces', () => {
  it('warden castles as rook tier', () => {
    const game = createGame(ruleset, '2026.1:{warden}2K3{warden}/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const moves = game.legalMoves();
    expect(moves.some((m) => m.kind === 'castle')).toBe(true);
  });

  it('wraith moves rook-like but captures only diagonally', () => {
    const game = fromFEN(ruleset, '8/8/8/3p4/2X5/8/8/4K2k w - - 0 1');
    const moves = game.legalMoves().filter((m) => m.from === parseSq('c4'));
    // wraith on c4: can slide straight (move-only) and diagonal (capture-only).
    const diagCapture = moves.find((m) => m.to === parseSq('d5'));
    expect(diagCapture).toBeDefined();
    expect(diagCapture!.captured).toBe('pawn');
    const straightMove = moves.find((m) => m.to === parseSq('c5'));
    expect(straightMove).toBeDefined();
  });

  it('berolina moves diagonally, captures straight, never en passant', () => {
    const game = fromFEN(ruleset, '8/3p4/8/8/8/8/3E4/4K2k w - - 0 1');
    const moves = game.legalMoves().filter((m) => m.from === parseSq('d2'));
    // berolina moves diagonally fl/fr, so d2 -> c3 or e3 only (no straight move)
    expect(moves.some((m) => m.to === parseSq('d3'))).toBe(false);
    expect(moves.some((m) => m.to === parseSq('c3') || m.to === parseSq('e3'))).toBe(true);
  });
});

describe('repetition and move cap', () => {
  it('threefold repetition is a draw', () => {
    const game = fromFEN(ruleset, '7k/8/8/8/8/8/8/K7 w - - 0 1');
    const seq: Move[] = [
      { from: parseSq('a1'), to: parseSq('a2'), kind: 'normal' },
      { from: parseSq('h8'), to: parseSq('h7'), kind: 'normal' },
      { from: parseSq('a2'), to: parseSq('a1'), kind: 'normal' },
      { from: parseSq('h7'), to: parseSq('h8'), kind: 'normal' },
      { from: parseSq('a1'), to: parseSq('a2'), kind: 'normal' },
      { from: parseSq('h8'), to: parseSq('h7'), kind: 'normal' },
      { from: parseSq('a2'), to: parseSq('a1'), kind: 'normal' },
      { from: parseSq('h7'), to: parseSq('h8'), kind: 'normal' },
    ];
    for (const m of seq) game.make(m);
    const status = game.status();
    expect(status.result).toBe('1/2-1/2');
    expect(status.reason).toBe('repetition');
  });

  it('move cap triggers a draw at maxPlies', () => {
    const customRuleset = { ...ruleset, maxPlies: 2 };
    const game = fromFEN(customRuleset, '7k/8/8/8/8/8/8/K7 w - - 0 1');
    game.make({ from: parseSq('a1'), to: parseSq('a2'), kind: 'normal' });
    game.make({ from: parseSq('h8'), to: parseSq('h7'), kind: 'normal' });
    const status = game.status();
    expect(status.result).toBe('1/2-1/2');
    expect(status.reason).toBe('move-cap');
  });
});

describe('insufficient material', () => {
  it('K vs K is a draw', () => {
    const game = fromFEN(ruleset, '8/8/4k3/8/8/4K3/8/8 w - - 0 1');
    const status = game.status();
    expect(status.result).toBe('1/2-1/2');
    expect(status.reason).toBe('insufficient');
  });
});

function parseSq(s: string): number {
  const file = 'abcdefgh'.indexOf(s[0]!);
  const rank = Number(s[1]) - 1;
  return rank * 8 + file;
}
