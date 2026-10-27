import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame, fromFEN, perft } from './index.js';

const ruleset = getRuleset('2026.1')!;

describe('perft — standard chess (vanilla army via 2026.1 ruleset)', () => {
  it('start position', () => {
    const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    expect(perft(game, 1)).toBe(20);
    expect(perft(game, 2)).toBe(400);
    expect(perft(game, 3)).toBe(8902);
    expect(perft(game, 4)).toBe(197281);
  }, 60_000);

  it('start position depth 5', () => {
    const game = createGame(ruleset, '2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP/8');
    expect(perft(game, 5)).toBe(4865609);
  }, 120_000);
});

describe('perft — Kiwipete (chessprogramming.org Perft Results, Position 2)', () => {
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  it('depths 1-3', () => {
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 1)).toBe(48);
    expect(perft(game, 2)).toBe(2039);
    expect(perft(game, 3)).toBe(97862);
  }, 60_000);

  it('depth 4', () => {
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 4)).toBe(4085603);
  }, 120_000);
});

describe('perft — chessprogramming.org Perft Results, Position 3', () => {
  const fen = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
  it('depths 1-5', () => {
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 1)).toBe(14);
    expect(perft(game, 2)).toBe(191);
    expect(perft(game, 3)).toBe(2812);
    expect(perft(game, 4)).toBe(43238);
    expect(perft(game, 5)).toBe(674624);
  }, 120_000);
});

describe('perft — chessprogramming.org Perft Results, Position 4', () => {
  const fen = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
  it('depths 1-4', () => {
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 1)).toBe(6);
    expect(perft(game, 2)).toBe(264);
    expect(perft(game, 3)).toBe(9467);
    expect(perft(game, 4)).toBe(422333);
  }, 60_000);
});

describe('perft — chessprogramming.org Perft Results, Position 5', () => {
  const fen = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';
  it('depths 1-4', () => {
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 1)).toBe(44);
    expect(perft(game, 2)).toBe(1486);
    expect(perft(game, 3)).toBe(62379);
    expect(perft(game, 4)).toBe(2103487);
  }, 60_000);
});

describe('perft — chessprogramming.org Perft Results, Position 6', () => {
  const fen = 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10';
  it('depths 1-4', () => {
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 1)).toBe(46);
    expect(perft(game, 2)).toBe(2079);
    expect(perft(game, 3)).toBe(89890);
    expect(perft(game, 4)).toBe(3894594);
  }, 60_000);
});

// Chess960 perft positions from chessprogramming.org "Chess960 Perft Results"
// (Andrew Grant / Ethereal fischer.epd set), Shredder-FEN.
describe('perft — Chess960 positions (chessprogramming.org Chess960 Perft Results)', () => {
  it('position #1', () => {
    const fen = 'bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9';
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 1)).toBe(21);
    expect(perft(game, 2)).toBe(528);
    expect(perft(game, 3)).toBe(12189);
  }, 60_000);

  it('position #2', () => {
    const fen = '2nnrbkr/p1qppppp/8/1ppb4/6PP/3PP3/PPP2P2/BQNNRBKR w HEhe - 1 9';
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 1)).toBe(21);
    expect(perft(game, 2)).toBe(807);
    expect(perft(game, 3)).toBe(18002);
  }, 60_000);

  it('position #3', () => {
    const fen = 'b1q1rrkb/pppppppp/3nn3/8/P7/1PPP4/4PPPP/BQNNRKRB w GE - 1 9';
    const game = fromFEN(ruleset, fen);
    expect(perft(game, 1)).toBe(20);
    expect(perft(game, 2)).toBe(479);
    expect(perft(game, 3)).toBe(10471);
  }, 60_000);
});
