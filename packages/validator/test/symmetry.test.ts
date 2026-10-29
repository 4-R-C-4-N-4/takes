import { describe, expect, it } from 'vitest';
import { getRuleset } from '@takes/library';
import { validatePiece, validateRuleset, isFrontBackSymmetric } from '../src/index.js';

const r = getRuleset('2026.2')!;
describe('D19 full symmetry above pawn tier', () => {
  it('flags the Lancer (forward rook, one-step retreat) as a warning only', () => {
    const issues = validatePiece(r.pieces.lancer!);
    expect(issues.find((i) => i.code === 'FRONT_BACK_SYMMETRY')?.severity).toBe('warning');
  });
  it('accepts every fully symmetric officer in the library', () => {
    for (const id of ['knight', 'bishop', 'rook', 'queen', 'wraith', 'toad', 'heron', 'dragon']) {
      const codes = validatePiece(r.pieces[id]!).map((i) => i.code);
      expect(codes, id).not.toContain('FRONT_BACK_SYMMETRY');
      expect(codes, id).not.toContain('LEFT_RIGHT_SYMMETRY');
    }
  });
  it('warns on lopsided rook- and major-tier pieces too', () => {
    const lopsided = { id: 'x', name: 'x', glyph: 'Z', tier: 'major' as const, components: [
      { vec: [1, 0] as [number, number], sym: 'all' as const, range: Infinity, path: 'slide' as const, mode: 'both' as const },
      { vec: [1, 1] as [number, number], sym: ['fr' as const], range: Infinity, path: 'slide' as const, mode: 'both' as const },
    ] };
    const codes = validatePiece(lopsided).map((i) => i.code);
    expect(codes).toContain('FRONT_BACK_SYMMETRY');
    expect(codes).toContain('LEFT_RIGHT_SYMMETRY');
    expect(isFrontBackSymmetric(lopsided)).toBe(false);
  });
  it('2026.3 and 2026.4 have no D19 warnings at all (Lancer is gone)', () => {
    for (const v of ['2026.3', '2026.4']) expect(validateRuleset(getRuleset(v)!), v).toEqual([]);
  });
  it('never applies to pawn-tier pieces and keeps the ruleset error-free', () => {
    expect(validatePiece(r.pieces.pawn!).some((i) => i.code === 'FRONT_BACK_SYMMETRY')).toBe(false);
    expect(validateRuleset(r).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
