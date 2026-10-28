import { describe, it, expect } from 'vitest';
import {
  isFrontBackSymmetricKey, isLeftRightSymmetricKey, isFullySymmetricKey, passesFullSymmetry,
} from './symmetry.js';

describe('isFrontBackSymmetricKey', () => {
  it('rook (orthogonal slides) is front/back symmetric', () => {
    expect(isFrontBackSymmetricKey('1,0,inf,slide,both;-1,0,inf,slide,both;0,1,inf,slide,both;0,-1,inf,slide,both')).toBe(true);
  });

  it('forward-only vector with no matching backward vector is asymmetric', () => {
    expect(isFrontBackSymmetricKey('1,1,inf,slide,both;0,1,inf,slide,both')).toBe(false);
  });

  it('empty key is vacuously symmetric', () => {
    expect(isFrontBackSymmetricKey('')).toBe(true);
  });
});

describe('isLeftRightSymmetricKey', () => {
  it('rook is left/right symmetric', () => {
    expect(isLeftRightSymmetricKey('1,0,inf,slide,both;-1,0,inf,slide,both;0,1,inf,slide,both;0,-1,inf,slide,both')).toBe(true);
  });

  it('sideways-only vector on one side only is asymmetric', () => {
    expect(isLeftRightSymmetricKey('1,0,inf,slide,both;0,1,inf,slide,both')).toBe(false);
  });
});

describe('isFullySymmetricKey', () => {
  it('rook (all four orthogonal directions) is fully symmetric', () => {
    expect(isFullySymmetricKey('1,0,inf,slide,both;-1,0,inf,slide,both;0,1,inf,slide,both;0,-1,inf,slide,both')).toBe(true);
  });

  it('bishop (all four diagonals) is fully symmetric', () => {
    expect(isFullySymmetricKey('1,1,inf,slide,both;1,-1,inf,slide,both;-1,1,inf,slide,both;-1,-1,inf,slide,both')).toBe(true);
  });

  it('left-only vector with no matching right vector is asymmetric', () => {
    // wazir forward+backward+left only, missing the right-leaning sideways step
    expect(isFullySymmetricKey('0,1,1,leap,both;0,-1,1,leap,both;-1,0,1,leap,both')).toBe(false);
  });

  it('real asymmetric candidate example from the catalog', () => {
    const key = '-1,-1,inf,slide,both;-1,0,2,slide,both;0,-1,2,slide,both;1,-1,inf,slide,both;1,0,2,slide,both';
    expect(isFullySymmetricKey(key)).toBe(false);
  });
});

describe('passesFullSymmetry', () => {
  it('pawn tier always passes, even with asymmetric key', () => {
    expect(passesFullSymmetry('0,1,1,slide,move', 'pawn')).toBe(true);
  });

  it('non-pawn tier defers to full symmetry', () => {
    expect(passesFullSymmetry('0,1,1,slide,move', 'minor')).toBe(false);
  });

  it('non-pawn tier passes when fully symmetric', () => {
    const rook = '1,0,inf,slide,both;-1,0,inf,slide,both;0,1,inf,slide,both;0,-1,inf,slide,both';
    expect(passesFullSymmetry(rook, 'rook')).toBe(true);
  });
});
