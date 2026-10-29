import { describe, expect, it } from 'vitest';
import { CURRENT_RULESET_VERSION, getRuleset, parseSetup, setupCost } from './index.js';

const r = getRuleset('2026.5')!;
const prev = getRuleset('2026.4')!;

describe('ruleset 2026.5: pawn tier re-priced so strict downgrades cost less', () => {
  it('is current; roster, movement, tiers and caps are unchanged from 2026.4', () => {
    expect(CURRENT_RULESET_VERSION).toBe('2026.5');
    expect(r.pieces).toEqual(prev.pieces);
    expect(r.maxCount).toEqual(prev.maxCount);
    expect(r.pool).toBe(prev.pool);
  });

  it('uses the agreed pawn-tier ladder (half points allowed)', () => {
    expect({ broom: r.costs.broom, rose: r.costs.rose, sai: r.costs.sai, worm: r.costs.worm, vine: r.costs.vine, triton: r.costs.triton })
      .toEqual({ broom: 1, rose: 1.5, sai: 2, worm: 2, vine: 2, triton: 2.5 });
    const changed = ['rose', 'sai', 'worm', 'vine', 'triton'];
    for (const id of Object.keys(r.costs)) if (!changed.includes(id)) expect(r.costs[id], id).toBe(prev.costs[id]);
  });

  it('every pawn-tier strict downgrade costs less, and none reaches Bishop price', () => {
    expect(r.costs.rose!).toBeLessThan(r.costs.sai!);
    expect(r.costs.rose!).toBeLessThan(r.costs.worm!);
    expect(r.costs.sai!).toBeLessThan(r.costs.triton!);
    expect(r.costs.worm!).toBeLessThan(r.costs.triton!);
    for (const id of ['rose', 'sai', 'worm', 'vine', 'triton']) expect(r.costs[id]!, id).toBeLessThan(r.costs.bishop!);
  });

  it('half-point costs add up exactly', () => {
    expect(setupCost(parseSetup('2026.5:R{octopus}B1KB{turtle}R/PPP{triton}{triton}PPP/8'), r)).toBe(35);
    expect(setupCost(parseSetup('2026.5:RNBQKBNR/{rose}PPPPPP{rose}/8'), r)).toBe(40);
  });
});
