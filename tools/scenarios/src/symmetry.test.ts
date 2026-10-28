import { expect, it } from 'vitest';
import { isMirrorSymmetric, isFrontBackSymmetric } from './cli.js';

it('detects left/right mirror symmetry of catalog keys', () => {
  expect(isMirrorSymmetric('-1,1,1,slide,capture;0,1,1,slide,move;1,1,1,slide,capture')).toBe(true);
  expect(isMirrorSymmetric('-1,1,3,slide,both;0,1,1,slide,move')).toBe(false);
});

it('detects front/back symmetry', () => {
  expect(isFrontBackSymmetric('0,1,inf,slide,both;0,-1,inf,slide,both')).toBe(true);
  expect(isFrontBackSymmetric('0,1,inf,slide,both;0,-1,1,slide,both')).toBe(false); // lancer-like
});
