/** Assigns a unique, stable glyph letter to a candidate piece: any uppercase A-Z not already used
 * by the ruleset's pieces and never 'K' (the engine king, D5). Deterministic (alphabetical scan). */
import type { Ruleset } from '@takes/library';

export function assignGlyph(r: Ruleset, extraUsed: string[] = []): string {
  const used = new Set<string>(['K', ...Object.values(r.pieces).map((p) => p.glyph.toUpperCase()), ...extraUsed.map((s) => s.toUpperCase())]);
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    if (!used.has(letter)) return letter;
  }
  throw new Error('no free glyph letters left (A-Z exhausted)');
}
