import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { assignGlyph } from '../src/glyph.js';

describe('assignGlyph', () => {
  const r = getRuleset('2026.2')!;

  it('picks a letter not already used by the ruleset', () => {
    const used = new Set(Object.values(r.pieces).map((p) => p.glyph.toUpperCase()));
    const glyph = assignGlyph(r);
    expect(used.has(glyph)).toBe(false);
  });

  it('never assigns K (reserved for the engine king)', () => {
    expect(assignGlyph(r)).not.toBe('K');
  });

  it('avoids letters passed in extraUsed, for assigning several candidates at once', () => {
    const first = assignGlyph(r);
    const second = assignGlyph(r, [first]);
    expect(second).not.toBe(first);
  });

  it('is deterministic for the same ruleset', () => {
    expect(assignGlyph(r)).toBe(assignGlyph(r));
  });
});
