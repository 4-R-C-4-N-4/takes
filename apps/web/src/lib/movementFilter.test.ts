import { describe, expect, it } from 'vitest';
import { hasSameMovesAndAttacksKey } from './movementFilter.js';

describe('same moves and attacks filter', () => {
  it('allows ordinary both-mode movement', () => {
    expect(hasSameMovesAndAttacksKey('1,1,3,slide,both;1,2,1,leap,both')).toBe(true);
  });

  it('rejects pawn-style split movement without a pawn exemption', () => {
    expect(hasSameMovesAndAttacksKey('0,1,1,slide,move;-1,1,1,slide,capture;1,1,1,slide,capture')).toBe(false);
  });

  it('rejects extra capture-only or quiet-only moves', () => {
    for (const mode of ['move', 'capture']) {
      expect(hasSameMovesAndAttacksKey(`1,1,3,slide,both;1,2,1,leap,${mode}`)).toBe(false);
    }
  });

  it('accepts equivalent move/capture unions and redundant shorter rays', () => {
    expect(hasSameMovesAndAttacksKey('1,0,inf,slide,move;1,0,inf,slide,capture;1,0,2,slide,capture')).toBe(true);
  });

  it('rejects mismatched ranges', () => {
    expect(hasSameMovesAndAttacksKey('1,0,3,slide,move;1,0,2,slide,capture')).toBe(false);
  });

  it('distinguishes a two-square slide from a leap to the same square', () => {
    expect(hasSameMovesAndAttacksKey('1,0,2,slide,move;1,0,1,slide,capture;2,0,1,leap,capture')).toBe(false);
  });

  it('equates adjacent slides and leaps', () => {
    expect(hasSameMovesAndAttacksKey('1,0,1,slide,move;1,0,1,leap,capture')).toBe(true);
  });

  it('ignores a slide destination already covered by a both-mode leap', () => {
    expect(hasSameMovesAndAttacksKey('1,0,2,slide,move;1,0,1,slide,capture;2,0,1,leap,both')).toBe(true);
  });
});
