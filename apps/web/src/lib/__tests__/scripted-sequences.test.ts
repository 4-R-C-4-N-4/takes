import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame } from '@takes/engine';

describe('scratch: scripted sequences', () => {
  it('castling', () => {
    const ruleset = getRuleset('2026.1')!;
    const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const moves = 'e2e4,e7e5,g1f3,b8c6,f1c4,f8c5,e1h1'.split(',');
    for (const uci of moves) {
      const m = game.parseUci(uci);
      console.log(uci, '->', m);
      expect(m).not.toBeNull();
      game.make(m!);
    }
    expect(game.ply()).toBe(7);
  });

  it('en passant', () => {
    const ruleset = getRuleset('2026.1')!;
    const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const moves = 'e2e4,a7a6,e4e5,d7d5,e5d6'.split(',');
    for (const uci of moves) {
      const m = game.parseUci(uci);
      console.log(uci, '->', m);
      expect(m).not.toBeNull();
      game.make(m!);
    }
  });

  it('promotion', () => {
    const ruleset = getRuleset('2026.1')!;
    const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const moves = 'b2b4,a7a5,b4a5,b7b6,a5a6,c7c6,a6a7,c6c5,a7b8q'.split(',');
    for (const uci of moves) {
      const m = game.parseUci(uci);
      console.log(uci, '->', m);
      expect(m).not.toBeNull();
      game.make(m!);
    }
  });
});
