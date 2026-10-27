import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { withPieceValues, pawnsToInternal, PAWN_VALUE_MG, PAWN_VALUE_EG } from '../src/ini.js';
import { variantIni } from '@takes/betza';

const ruleset = getRuleset('2026.1')!;

describe('ini value injection', () => {
  it('appends pieceValueMg/Eg lines keyed by glyph', () => {
    const base = variantIni(ruleset);
    const withVals = withPieceValues(base, ruleset, [{ pieceId: 'wraith', mg: 300, eg: 320 }]);
    expect(withVals).toContain('pieceValueMg = x:300');
    expect(withVals).toContain('pieceValueEg = x:320');
    expect(withVals.startsWith(base)).toBe(true);
  });

  it('is a no-op for an empty override list', () => {
    const base = variantIni(ruleset);
    expect(withPieceValues(base, ruleset, [])).toBe(base);
  });

  it('converts pawn units to FSF internal mg/eg scale', () => {
    const { mg, eg } = pawnsToInternal(3);
    expect(mg).toBe(3 * PAWN_VALUE_MG);
    expect(eg).toBe(3 * PAWN_VALUE_EG);
  });
});
