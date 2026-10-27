import { describe, it, expect } from 'vitest';
import { fitLogistic, invertLogistic, sigmoid, scoreWithCi, bootstrapValueCi } from '../src/logistic.js';

describe('logistic fit', () => {
  it('recovers a known a/b from synthetic points', () => {
    const a = -0.3;
    const b = 0.6;
    const xs = [-3, -1, 0, 1, 3, 5];
    const ps = xs.map((x) => sigmoid(a, b, x));
    const fit = fitLogistic(xs, ps, 6000, 0.1);
    expect(fit.a).toBeCloseTo(a, 1);
    expect(fit.b).toBeCloseTo(b, 1);
  });

  it('inverts to recover x from p', () => {
    const fit = { a: 0, b: 0.5 };
    const p = sigmoid(fit.a, fit.b, 2);
    expect(invertLogistic(fit, p)).toBeCloseTo(2, 5);
  });
});

describe('score CI', () => {
  it('is wide for few games, narrow for many', () => {
    const few = scoreWithCi(6, 0, 4);
    const many = scoreWithCi(600, 0, 400);
    expect(few.ciHalfWidth).toBeGreaterThan(many.ciHalfWidth);
  });

  it('centers at 0.5 for an even split', () => {
    const r = scoreWithCi(10, 0, 10);
    expect(r.p).toBeCloseTo(0.5, 5);
  });
});

describe('bootstrap value CI', () => {
  it('estimates near the reference value when the piece is even (50% score)', () => {
    const fit = { a: 0, b: 1 };
    const outcomes: Array<-1 | 0 | 1> = Array(40).fill(0).map((_, i) => (i % 2 === 0 ? 1 : -1));
    const { estimate, lo, hi } = bootstrapValueCi(outcomes, fit, 3, 500, 42);
    expect(estimate).toBeCloseTo(3, 1);
    expect(lo).toBeLessThanOrEqual(estimate);
    expect(hi).toBeGreaterThanOrEqual(estimate);
  });
});
