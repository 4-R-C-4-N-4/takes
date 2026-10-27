import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame } from '@takes/engine';
import { fsfPath } from '@takes/betza';
import { randomProfile, mulberry32, parity } from './index.js';

const r = getRuleset('2026.1')!;
const N = Number(process.env.PARITY_N ?? 100);
const DEPTH = Number(process.env.PARITY_DEPTH ?? 3);

function report(res: ReturnType<typeof parity>) {
  const bad = res.filter((x) => !x.ok);
  for (const b of bad.slice(0, 5)) console.error(`MISMATCH ${b.case.white} vs ${b.case.black}\nFEN ${b.case.fen}\n  ` + b.diff.slice(0, 12).join('\n  '));
  return bad.length;
}

describe('random profiles', () => {
  it('generator is deterministic and valid', () => {
    const a = randomProfile(r, mulberry32(7)); const b = randomProfile(r, mulberry32(7));
    expect(a).toBe(b);
    expect(() => createGame(r, a, b)).not.toThrow();
  });
});

describe.skipIf(!fsfPath())('engine vs Fairy-Stockfish perft parity (M5)', () => {
  it(`${N} random profile pairs, start position, depth ${DEPTH}`, () => {
    const rand = mulberry32(20261027);
    const cases = Array.from({ length: N }, () => ({ white: randomProfile(r, rand), black: randomProfile(r, rand) }));
    expect(report(parity(r, cases, DEPTH))).toBe(0);
  });
  it(`${N} random profile pairs after a random 12-40 ply playout, depth 2`, () => {
    const rand = mulberry32(99);
    const cases = Array.from({ length: N }, () => ({ white: randomProfile(r, rand), black: randomProfile(r, rand) }));
    const play = (g: import('@takes/engine').Game) => {
      const n = 12 + Math.floor(rand() * 29);
      for (let i = 0; i < n; i++) {
        if (g.status().result !== '*') break;
        const ms = g.legalMoves(); if (!ms.length) break;
        g.make(ms[Math.floor(rand() * ms.length)]!);
      }
    };
    expect(report(parity(r, cases, 2, play))).toBe(0);
  });
});
