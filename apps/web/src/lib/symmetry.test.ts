import { describe, it, expect } from 'vitest';
import { isFrontBackSymmetricKey, passesFrontBackSymmetry } from './symmetry.js';

describe('isFrontBackSymmetricKey', () => {
  it('rook (orthogonal slides) is symmetric', () => {
    expect(isFrontBackSymmetricKey('1,0,inf,slide,both;-1,0,inf,slide,both;0,1,inf,slide,both;0,-1,inf,slide,both')).toBe(true);
  });

  it('knight-like leap mirrored on both dy signs is symmetric', () => {
    expect(isFrontBackSymmetricKey('1,2,1,leap,both;1,-2,1,leap,both')).toBe(true);
  });

  it('forward-only vector with no matching backward vector is asymmetric', () => {
    expect(isFrontBackSymmetricKey('1,1,inf,slide,both;0,1,inf,slide,both')).toBe(false);
  });

  it('empty key is vacuously symmetric', () => {
    expect(isFrontBackSymmetricKey('')).toBe(true);
  });

  it('real asymmetric candidate example from the catalog', () => {
    const key = '-1,-1,inf,slide,both;-1,0,2,slide,both;0,-1,2,slide,both;1,-1,inf,slide,both;1,0,2,slide,both';
    expect(isFrontBackSymmetricKey(key)).toBe(false);
  });
});

describe('passesFrontBackSymmetry', () => {
  it('pawn tier always passes, even with asymmetric key', () => {
    expect(passesFrontBackSymmetry('0,1,1,slide,move', 'pawn')).toBe(true);
  });

  it('non-pawn tier defers to key symmetry', () => {
    expect(passesFrontBackSymmetry('0,1,1,slide,move', 'minor')).toBe(false);
  });
});
