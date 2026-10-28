import { describe, expect, it } from 'vitest';
import { getRuleset } from '@takes/library';
import { validatePiece, validateRuleset, isFrontBackSymmetric } from '../src/index.js';

const r = getRuleset('2026.2')!;
describe('D19 front/back symmetry for minor pieces', () => {
  it('flags the Lancer (forward rook, one-step retreat) as a warning only', () => {
    const issues = validatePiece(r.pieces.lancer!);
    expect(issues.find((i) => i.code === 'FRONT_BACK_SYMMETRY')?.severity).toBe('warning');
  });
  it('accepts symmetric minors', () => {
    for (const id of ['knight', 'bishop', 'wraith', 'toad', 'heron']) expect(isFrontBackSymmetric(r.pieces[id]!), id).toBe(true);
  });
  it('never applies to pawn-tier pieces and keeps the ruleset error-free', () => {
    expect(validatePiece(r.pieces.pawn!).some((i) => i.code === 'FRONT_BACK_SYMMETRY')).toBe(false);
    expect(validateRuleset(r).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
