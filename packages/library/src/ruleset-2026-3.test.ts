import { describe, expect, it } from 'vitest';
import { expandPiece, getRuleset, parseSetup, setupCost } from './index.js';
import verdicts from '../../../docs/catalog/verdicts.json' with { type: 'json' };

const r = getRuleset('2026.3')!;
const CLASSICS = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const key = (v: { dx: number; dy: number; range: number; path: string; mode: string }) =>
  `${v.dx},${v.dy},${v.range === Infinity ? 'inf' : v.range},${v.path},${v.mode}`;

describe('ruleset 2026.3', () => {
  const keepers = verdicts.filter((v) => v.verdict === 'keep');

  it('the five classics plus the 20 designer keepers, nothing else', () => {
    expect(keepers).toHaveLength(20);
    expect(Object.keys(r.pieces).sort()).toEqual([...CLASSICS, ...keepers.map((k) => k.name!.toLowerCase())].sort());
    for (const id of ['wraith', 'lancer', 'berolina', 'toad', 'heron', 'dragon']) expect(r.pieces[id], id).toBeUndefined();
    expect(getRuleset('2026.2')!.pieces.dragon).toBeDefined();
  });

  it('every keeper moves exactly as the screened catalog key, with the vetted tier and name', () => {
    for (const k of keepers) {
      const p = r.pieces[k.name!.toLowerCase()]!;
      expect(p.name).toBe(k.name);
      expect(p.tier).toBe(k.tier);
      expect(expandPiece(p, 'w').map(key).sort().join(';'), k.betza).toBe(k.key.split(';').sort().join(';'));
    }
  });

  it('uses 25 unique glyphs and caps the heavy pieces at one', () => {
    const glyphs = Object.values(r.pieces).map((p) => p.glyph);
    expect(new Set(glyphs).size).toBe(25);
    expect(glyphs).not.toContain('K');
    expect(r.maxCount).toEqual({ queen: 1, hierophant: 1, bane: 1, coroner: 1 });
  });

  it('seed armies fit the pool', () => {
    expect(setupCost(parseSetup('2026.3:R1B{bane}KB1R/PPPPPPPP/8'), r)).toBe(36);
    expect(setupCost(parseSetup('2026.3:R{scarab}B{hierophant}KB{seal}1/PPPPPPPP/8'), r)).toBe(37);
  });
});
