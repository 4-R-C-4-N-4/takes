import { describe, it, expect } from 'vitest';
import { squareName, parseSquareName, sqOf, fileOf, rankOf, isLight } from '../board.js';

describe('board math', () => {
  it('round-trips square names', () => {
    for (const name of ['a1', 'h8', 'e4', 'd5']) {
      expect(squareName(parseSquareName(name))).toBe(name);
    }
  });

  it('a1 is 0 and h8 is 63', () => {
    expect(sqOf(0, 0)).toBe(0);
    expect(sqOf(7, 7)).toBe(63);
  });

  it('file/rank decompose correctly', () => {
    const sq = sqOf(3, 2); // d3
    expect(fileOf(sq)).toBe(3);
    expect(rankOf(sq)).toBe(2);
  });

  it('a1 is dark (not light)', () => {
    expect(isLight(sqOf(0, 0))).toBe(false);
    expect(isLight(sqOf(1, 0))).toBe(true);
  });
});
