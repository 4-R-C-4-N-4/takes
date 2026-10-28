import { describe, expect, it } from 'vitest';
import { expandPiece, getRuleset, parseSetup, setupCost } from './index.js';

const r = getRuleset('2026.2')!;
const sq = (v: { dx: number; dy: number; range: number; path: string }) => `${v.dx},${v.dy},${v.range},${v.path}`;

describe('ruleset 2026.2', () => {
  it('drops warden, adds toad/heron/dragon, and keeps 2026.1 immutable', () => {
    expect(r.pieces.warden).toBeUndefined();
    expect(Object.keys(r.pieces)).toEqual(expect.arrayContaining(['toad', 'heron', 'dragon']));
    expect(getRuleset('2026.1')!.pieces.warden).toBeDefined();
    expect(r.maxCount).toEqual({ queen: 1, dragon: 1 });
  });
  it('toad leaps two orthogonally and steps one diagonally', () => {
    expect(expandPiece(r.pieces.toad!, 'w').map(sq).sort()).toEqual([
      '-1,-1,1,slide', '-1,1,1,slide', '-2,0,1,leap', '0,-2,1,leap', '0,2,1,leap', '1,-1,1,slide', '1,1,1,slide', '2,0,1,leap',
    ]);
  });
  it('heron leaps two diagonally and steps one orthogonally', () => {
    expect(expandPiece(r.pieces.heron!, 'w').map(sq).sort()).toEqual([
      '-1,0,1,slide', '-2,-2,1,leap', '-2,2,1,leap', '0,-1,1,slide', '0,1,1,slide', '1,0,1,slide', '2,-2,1,leap', '2,2,1,leap',
    ]);
  });
  it('dragon is a queen plus exactly-one-square hop in all eight directions', () => {
    const v = expandPiece(r.pieces.dragon!, 'w');
    expect(v.filter((x) => x.path === 'slide' && x.range === Infinity)).toHaveLength(8);
    expect(v.filter((x) => x.path === 'leap').map((x) => Math.max(Math.abs(x.dx), Math.abs(x.dy)))).toEqual(Array(8).fill(2));
  });
  it('sample hopper and dragon armies fit the pool', () => {
    expect(setupCost(parseSetup('2026.2:R{toad}BQKB{heron}R/PPPPPPPP/8'), r)).toBe(39);
    expect(setupCost(parseSetup('2026.2:R1B{dragon}KB1R/PPPPPPPP/8'), r)).toBe(37);
  });
});
