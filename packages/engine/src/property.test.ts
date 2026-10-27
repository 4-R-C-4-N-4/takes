import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getRuleset } from '@takes/library';
import { createGame, fromFEN } from './index.js';
import type { Game, Move } from './index.js';

const ruleset = getRuleset('2026.1')!;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLegalWalk(game: Game, rand: () => number, steps: number): Move[] {
  const played: Move[] = [];
  for (let i = 0; i < steps; i++) {
    const status = game.status();
    if (status.result !== '*') break;
    const moves = game.legalMoves();
    if (moves.length === 0) break;
    const idx = Math.floor(rand() * moves.length);
    const m = moves[idx]!;
    game.make(m);
    played.push(m);
  }
  return played;
}

describe('property: make/unmake restores exact state (vanilla army)', () => {
  it('random legal walks round-trip board/FEN/hash', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 1, max: 25 }), (seed, steps) => {
        const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
        const rand = mulberry32(seed);
        const beforeFEN = game.toFEN();
        const beforeHash = game.hash();
        const played = randomLegalWalk(game, rand, steps);
        for (let i = 0; i < played.length; i++) game.unmake();
        expect(game.toFEN()).toBe(beforeFEN);
        expect(game.hash()).toBe(beforeHash);
      }),
      { numRuns: 50 },
    );
  });
});

describe("property: no legal move leaves mover's king in check", () => {
  it('holds across random legal walks', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 1, max: 20 }), (seed, steps) => {
        const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
        const rand = mulberry32(seed);
        for (let i = 0; i < steps; i++) {
          const status = game.status();
          if (status.result !== '*') break;
          const moves = game.legalMoves();
          if (moves.length === 0) break;
          const idx = Math.floor(rand() * moves.length);
          const mover = game.sideToMove();
          game.make(moves[idx]!);
          const board = game.board();
          const kingSq = board.findIndex((bp) => bp?.pieceId === 'king' && bp?.color === mover);
          expect(game.isAttacked(kingSq, mover === 'w' ? 'b' : 'w')).toBe(false);
        }
      }),
      { numRuns: 50 },
    );
  });
});

describe('property: FEN round-trip', () => {
  it('fromFEN(toFEN(game)) reproduces the same FEN', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 0, max: 15 }), (seed, steps) => {
        const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
        const rand = mulberry32(seed);
        randomLegalWalk(game, rand, steps);
        const fen = game.toFEN();
        const reloaded = fromFEN(ruleset, fen);
        expect(reloaded.toFEN()).toBe(fen);
      }),
      { numRuns: 50 },
    );
  });
});

describe('property: random library setups also round-trip make/unmake', () => {
  it('holds for a mixed setup with wraith/lancer/berolina/warden', () => {
    const whiteSetup = '2026.1:{warden}{knight}{bishop}{bishop}K{bishop}{knight}{warden}/{berolina}{pawn}{pawn}{pawn}{pawn}{pawn}{pawn}{berolina}/8';
    const blackSetup = '2026.1:{warden}{knight}{bishop}{bishop}K{bishop}{knight}{warden}/{berolina}{pawn}{pawn}{pawn}{pawn}{pawn}{pawn}{berolina}/8';
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 1, max: 15 }), (seed, steps) => {
        const game = createGame(ruleset, whiteSetup, blackSetup);
        const rand = mulberry32(seed);
        const beforeFEN = game.toFEN();
        const played = randomLegalWalk(game, rand, steps);
        for (let i = 0; i < played.length; i++) game.unmake();
        expect(game.toFEN()).toBe(beforeFEN);
      }),
      { numRuns: 30 },
    );
  });
});
