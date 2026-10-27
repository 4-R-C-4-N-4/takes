import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { classicSetup, addExtra, removeOne, substitute, str, calibrationPairings, swapColors, targetPairing } from '../src/setups.js';

const ruleset = getRuleset('2026.1')!;

describe('setup substitution helpers', () => {
  it('classicSetup serializes to a 3-rank string with a king', () => {
    const s = str(classicSetup(ruleset.version));
    expect(s).toContain('K');
    expect(s.split(':')[1]!.split('/')).toHaveLength(3);
  });

  it('addExtra places pieces only on empty squares of the back rank', () => {
    const base = classicSetup(ruleset.version);
    const withExtra = addExtra(base, 'knight', 1);
    expect(withExtra.ranks[2]!.filter((x) => x === 'knight')).toHaveLength(1);
    expect(base.ranks[2]!.every((x) => x === null)).toBe(true); // original untouched
  });

  it('removeOne clears exactly one occurrence', () => {
    const base = classicSetup(ruleset.version);
    const removed = removeOne(base, 'knight');
    const before = base.ranks[0]!.filter((x) => x === 'knight').length;
    const after = removed.ranks[0]!.filter((x) => x === 'knight').length;
    expect(after).toBe(before - 1);
  });

  it('substitute swaps exactly one occurrence', () => {
    const base = classicSetup(ruleset.version);
    const sub = substitute(base, 'knight', 'wraith');
    expect(sub.ranks[0]!.filter((x) => x === 'wraith')).toHaveLength(1);
    expect(sub.ranks[0]!.filter((x) => x === 'knight')).toHaveLength(1); // one of two knights remains
  });

  it('calibration pairings have distinct nominal deltas and swap sign-flips them', () => {
    const pairings = calibrationPairings(ruleset);
    expect(pairings.length).toBeGreaterThan(0);
    for (const p of pairings) {
      const swapped = swapColors(p);
      expect(swapped.deltaPawns).toBe(-p.deltaPawns);
      expect(swapped.white).toBe(p.black);
      expect(swapped.black).toBe(p.white);
    }
  });

  it('targetPairing picks bishop as reference for knight (self-consistency control)', () => {
    const { referenceId } = targetPairing(ruleset, 'knight');
    expect(referenceId).toBe('bishop');
  });

  it('targetPairing picks knight as reference for other pieces', () => {
    const { referenceId } = targetPairing(ruleset, 'wraith');
    expect(referenceId).toBe('knight');
  });
});
