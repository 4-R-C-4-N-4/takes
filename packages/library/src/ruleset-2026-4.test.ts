import { describe, expect, it } from 'vitest';
import { getRuleset, parseSetup, setupCost } from './index.js';

const r = getRuleset('2026.4')!;
const prev = getRuleset('2026.3')!;

describe('ruleset 2026.4', () => {
  it('keeps the 2026.3 roster and movement', () => {
    expect(Object.keys(r.pieces).sort()).toEqual(Object.keys(prev.pieces).sort());
    for (const id of Object.keys(r.pieces)) expect(r.pieces[id]!.components, id).toEqual(prev.pieces[id]!.components);
  });

  it('Coroner (BN) is major tier alongside the other capped heavy pieces; 2026.3 stays as published', () => {
    expect(r.pieces.coroner!.tier).toBe('major');
    expect(prev.pieces.coroner!.tier).toBe('minor');
    const capped = Object.keys(r.maxCount).sort();
    expect(capped).toEqual(['bane', 'coroner', 'hierophant', 'queen']);
    for (const id of capped) expect(r.pieces[id]!.tier, id).toBe('major');
  });

  it('Bane (RBN) costs 15 (was 12); every other cost is unchanged', () => {
    expect(r.costs.bane).toBe(15);
    expect(prev.costs.bane).toBe(12);
    for (const id of Object.keys(r.costs)) if (id !== 'bane') expect(r.costs[id], id).toBe(prev.costs[id]);
  });

  it('the Bane starter army still fits the 39-point pool', () => {
    expect(setupCost(parseSetup('2026.4:R1B{bane}KB1R/PPPPPPPP/8'), r)).toBe(39);
  });
});
