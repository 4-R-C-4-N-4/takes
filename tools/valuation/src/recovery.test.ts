import { describe, it, expect } from 'vitest';
import { getRuleset, parseSetup } from '@takes/library';
import { createGame } from '@takes/engine';
import { calibrationPairings, classicSetup, str, randomTargetPairing, sameTierPairing } from './setups.js';
import { perGameVariant } from './worker-pool.js';
import { bootstrapValueCi, invertLogistic, fitLogistic } from './logistic.js';
const r = getRuleset('2026.1')!;
const material = (setup: string) => parseSetup(setup).ranks.flat().reduce<number>((sum, id) => sum + (id ? ({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 }[id] ?? NaN) : 0), 0);

describe('recovery regressions', () => {
  it('calibration deltas equal the material actually added or removed', () => {
    for (const p of calibrationPairings(r)) expect(p.deltaPawns).toBe(material(p.white) - material(p.black));
  });
  it('per-color promotions match game.promotionTargets exactly for asymmetric armies', () => {
    const p = sameTierPairing(r, 'wraith', 'rook', 5, 2).pairing;
    const game = createGame(r, p.white, p.black);
    const { ini } = perGameVariant(r, p.white, p.black);
    for (const [color, suffix] of [['w', 'White'], ['b', 'Black']] as const) {
      const expected = game.promotionTargets(color).map((id) => r.pieces[id]!.glyph.toLowerCase()).sort();
      const actual = new RegExp(`promotionPieceTypes${suffix} = (.*)`).exec(ini)![1]!.trim().split('').sort();
      expect(actual).toEqual(expected);
    }
    expect(game.promotionTargets('w')).not.toEqual(game.promotionTargets('b'));
  });
  it('random substitutions reject missing references instead of adding free material', () => {
    const p = sameTierPairing(r, 'wraith', 'rook', 5, 2).pairing;
    expect(() => randomTargetPairing(r, 'warden', 'rook', p.white)).toThrow("no 'rook'");
  });
  it('random multi-copy substitution replaces exactly the requested pawn count', () => {
    const p = randomTargetPairing(r, 'berolina', 'pawn', str(classicSetup(r.version)), 4);
    const ids = parseSetup(p.white).ranks.flat();
    expect(ids.filter((id) => id === 'pawn')).toHaveLength(4);
    expect(ids.filter((id) => id === 'berolina')).toHaveLength(4);
    expect(ids.filter(Boolean)).toHaveLength(16);
  });
  it('clamps material DELTAS, independent of the reference value', () => {
    const result = bootstrapValueCi([1, 1, 1], { a: 0, b: 1 }, 5, 100, 1, { lo: -2, hi: 2 });
    expect(result.estimate).toBe(7);
    expect(result.outOfRange).toBe(true);
  });
  it('rejects absent scored data and unidentifiable calibration', () => {
    expect(() => bootstrapValueCi([], { a: 0, b: 1 }, 3)).toThrow('no scored games');
    expect(() => invertLogistic({ a: 0, b: 0 }, 0.5)).toThrow('slope');
    expect(() => invertLogistic({ a: 0, b: -1 }, 0.5)).toThrow('slope');
    expect(() => fitLogistic([-1, 1], [0.25, 0.75], 100, 0.05, [0, 0])).toThrow('no scored calibration games');
    expect(() => fitLogistic([-1, 1], [0.25, 0.75], 100, 0.05, [1, -1])).toThrow('weights');
  });
});
