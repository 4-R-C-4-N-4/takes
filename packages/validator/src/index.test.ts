import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getRuleset, parseSetup } from '@takes/library';
import type { Piece } from '@takes/library';
import {
  validatePiece,
  validateRuleset,
  validateProfile,
  kingSafety,
  isCastlingEligible,
  hasErrors,
} from './index.js';

const rs = getRuleset('2026.1')!;

function basePiece(overrides: Partial<Piece>): Piece {
  return {
    id: 'test',
    name: 'Test',
    glyph: 'Z',
    tier: 'minor',
    components: [{ vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' }],
    ...overrides,
  };
}

describe('validatePiece: HAS_CAPTURE', () => {
  it('pass: has a capture component', () => {
    expect(validatePiece(basePiece({}))).toEqual([]);
  });
  it('fail: move-only piece', () => {
    const p = basePiece({ components: [{ vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'move' }] });
    const issues = validatePiece(p);
    expect(issues.some((i) => i.code === 'HAS_CAPTURE')).toBe(true);
  });
});

describe('validatePiece: LEAP_CAP', () => {
  it('pass: knight leap', () => {
    const p = basePiece({ components: [{ vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'both' }] });
    expect(validatePiece(p).some((i) => i.code === 'LEAP_CAP')).toBe(false);
  });
  it('fail: leap with |dy| > 2', () => {
    const p = basePiece({ components: [{ vec: [1, 3], sym: 'all', range: 1, path: 'leap', mode: 'both' }] });
    expect(validatePiece(p).some((i) => i.code === 'LEAP_CAP')).toBe(true);
  });
});

describe('validatePiece: SLIDE_UNIT (D3)', () => {
  it('pass: unit slide', () => {
    const p = basePiece({ components: [{ vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' }] });
    expect(validatePiece(p).some((i) => i.code === 'SLIDE_UNIT')).toBe(false);
  });
  it('fail: non-unit slide vector (rider)', () => {
    const p = basePiece({ components: [{ vec: [1, 2], sym: 'all', range: Infinity, path: 'slide', mode: 'both' }] });
    expect(validatePiece(p).some((i) => i.code === 'SLIDE_UNIT')).toBe(true);
  });
});

describe('validatePiece: RANK2_RESERVED', () => {
  it('pass: pawn uses rank2', () => {
    expect(validatePiece(rs.pieces.pawn!).some((i) => i.code === 'RANK2_RESERVED')).toBe(false);
  });
  it('fail: non-pawn uses rank2', () => {
    const p = basePiece({
      id: 'cheater',
      components: [
        { vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' },
        { vec: [0, 1], sym: ['f'], range: 2, path: 'slide', mode: 'move', cond: 'rank2' },
      ],
    });
    expect(validatePiece(p).some((i) => i.code === 'RANK2_RESERVED')).toBe(true);
  });
});

describe('validatePiece: PAWN_FORWARD', () => {
  it('pass: vanilla pawn', () => {
    expect(validatePiece(rs.pieces.pawn!).some((i) => i.code === 'PAWN_FORWARD')).toBe(false);
  });
  it('fail: pawn with a backward component', () => {
    const p = basePiece({
      id: 'badpawn',
      tier: 'pawn',
      components: [
        { vec: [0, 1], sym: ['f'], range: 1, path: 'slide', mode: 'move' },
        { vec: [0, 1], sym: ['b'], range: 1, path: 'slide', mode: 'capture' },
      ],
    });
    expect(validatePiece(p).some((i) => i.code === 'PAWN_FORWARD')).toBe(true);
  });
});

describe('validatePiece: PAWN_STRANDED [D7] — spec fixtures', () => {
  it('pass: vanilla pawn ([0,1] forward)', () => {
    expect(validatePiece(rs.pieces.pawn!).some((i) => i.code === 'PAWN_STRANDED')).toBe(false);
  });
  it('pass: forward-left + forward-right diagonal mover', () => {
    const p = basePiece({
      id: 'diagpawn',
      tier: 'pawn',
      components: [
        { vec: [1, 1], sym: ['fl', 'fr'], range: 1, path: 'slide', mode: 'both' },
      ],
    });
    expect(validatePiece(p).some((i) => i.code === 'PAWN_STRANDED')).toBe(false);
  });
  it('fail: forward-left only — stuck on the a-file', () => {
    const p = basePiece({
      id: 'flonly',
      tier: 'pawn',
      components: [
        { vec: [1, 1], sym: ['fl'], range: 1, path: 'slide', mode: 'both' },
      ],
    });
    const issue = validatePiece(p).find((i) => i.code === 'PAWN_STRANDED');
    expect(issue).toBeDefined();
    // a-file squares (file 0) on ranks 1-7 should be in the stranded list
    expect(issue!.squares).toContain(0); // a1
  });
  it('fail: [0,2]-only — stuck on rank 7', () => {
    const p = basePiece({
      id: 'jumponly',
      tier: 'pawn',
      components: [
        { vec: [0, 2], sym: ['f'], range: 1, path: 'slide', mode: 'both' },
      ],
    });
    const issue = validatePiece(p).find((i) => i.code === 'PAWN_STRANDED');
    expect(issue).toBeDefined();
    expect(issue!.squares).toContain(6 * 8); // a7 (rank idx 6)
  });
});

describe('validatePiece: ROOK_CASTLING [D1]', () => {
  it('pass: rook', () => {
    expect(validatePiece(rs.pieces.rook!).some((i) => i.code === 'ROOK_CASTLING')).toBe(false);
  });
  it('pass: warden', () => {
    expect(validatePiece(rs.pieces.warden!).some((i) => i.code === 'ROOK_CASTLING')).toBe(false);
  });
  it('fail: rook-tier piece without l/r infinite slide', () => {
    const p = basePiece({ id: 'badrook', tier: 'rook', components: [{ vec: [0, 1], sym: ['f', 'b'], range: Infinity, path: 'slide', mode: 'both' }] });
    expect(validatePiece(p).some((i) => i.code === 'ROOK_CASTLING')).toBe(true);
  });
});

describe('isCastlingEligible', () => {
  it('rook and warden are eligible', () => {
    expect(isCastlingEligible(rs.pieces.rook!)).toBe(true);
    expect(isCastlingEligible(rs.pieces.warden!)).toBe(true);
  });
  it('non-rook-tier piece is never a castling partner per spec, but structurally bishop fails anyway', () => {
    expect(isCastlingEligible(rs.pieces.bishop!)).toBe(false);
    expect(isCastlingEligible(rs.pieces.knight!)).toBe(false);
  });
});

describe('validatePiece: VALUE_BAND (warning)', () => {
  it('pass: pawn value 1 within band', () => {
    const p = basePiece({ tier: 'pawn', value: 1, components: [{ vec: [0, 1], sym: ['f'], range: 1, path: 'slide', mode: 'both' }] });
    expect(validatePiece(p).some((i) => i.code === 'VALUE_BAND')).toBe(false);
  });
  it('warn: pawn value 5 out of band', () => {
    const p = basePiece({ tier: 'pawn', value: 5, components: [{ vec: [0, 1], sym: ['f'], range: 1, path: 'slide', mode: 'both' }] });
    const issue = validatePiece(p).find((i) => i.code === 'VALUE_BAND');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });
});

describe('validatePiece: GLYPH [D5]', () => {
  it('pass: single uppercase letter', () => {
    expect(validatePiece(basePiece({ glyph: 'Z' })).some((i) => i.code === 'GLYPH')).toBe(false);
  });
  it('fail: lowercase glyph', () => {
    expect(validatePiece(basePiece({ glyph: 'z' })).some((i) => i.code === 'GLYPH')).toBe(true);
  });
  it("fail: glyph 'K'", () => {
    expect(validatePiece(basePiece({ glyph: 'K' })).some((i) => i.code === 'GLYPH')).toBe(true);
  });
});

describe('validatePiece: schema sanity', () => {
  it('pass: nonzero vector', () => {
    expect(validatePiece(basePiece({})).some((i) => i.code === 'BAD_VECTOR')).toBe(false);
  });
  it('fail: zero vector', () => {
    const p = basePiece({ components: [{ vec: [0, 0], sym: 'all', range: 1, path: 'slide', mode: 'both' }] });
    expect(validatePiece(p).some((i) => i.code === 'BAD_VECTOR')).toBe(true);
  });
});

describe('validateRuleset: shipped 2026.1 ruleset', () => {
  it('has zero errors', () => {
    const issues = validateRuleset(rs);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });
});

describe('validateRuleset: cross-piece rules', () => {
  it('fail: duplicate glyph', () => {
    const bad = JSON.parse(JSON.stringify(rs));
    bad.pieces.knight.glyph = bad.pieces.bishop.glyph;
    expect(validateRuleset(bad).some((i) => i.code === 'GLYPH_UNIQUE')).toBe(true);
  });
  it('fail: king defined as library piece', () => {
    const bad = JSON.parse(JSON.stringify(rs));
    bad.pieces.king = basePiece({ id: 'king' });
    expect(validateRuleset(bad).some((i) => i.code === 'NO_KING_PIECE')).toBe(true);
  });
  it('fail: missing cost entry', () => {
    const bad = JSON.parse(JSON.stringify(rs));
    delete bad.costs.rook;
    expect(validateRuleset(bad).some((i) => i.code === 'MISSING_COST')).toBe(true);
  });
  it('fail: maxCount references unknown piece', () => {
    const bad = JSON.parse(JSON.stringify(rs));
    bad.maxCount.ghost = 1;
    expect(validateRuleset(bad).some((i) => i.code === 'BAD_MAX_COUNT')).toBe(true);
  });
});

describe('validateProfile: PARSE / RULESET_VERSION', () => {
  it('pass: valid setup', () => {
    expect(validateProfile('2026.1:RNBQKBNR/PPPPPPPP/8', rs)).toEqual([]);
  });
  it('fail: bad string', () => {
    expect(validateProfile('garbage', rs).some((i) => i.code === 'PARSE')).toBe(true);
  });
  it('fail: wrong ruleset version', () => {
    expect(validateProfile('1999.1:RNBQKBNR/PPPPPPPP/8', rs).some((i) => i.code === 'RULESET_VERSION')).toBe(true);
  });
});

describe('validateProfile: UNKNOWN_PIECE', () => {
  it('pass: all pieces known', () => {
    expect(validateProfile('2026.1:RNBQKBNR/PPPPPPPP/8', rs).some((i) => i.code === 'UNKNOWN_PIECE')).toBe(false);
  });
  it('fail: unknown piece id', () => {
    expect(validateProfile('2026.1:R1BQKB{ghost}1/PPPPPPPP/8', rs).some((i) => i.code === 'UNKNOWN_PIECE')).toBe(true);
  });
});

describe('validateProfile: KING_COUNT / KING_RANK', () => {
  it('pass: exactly one king on rank 1', () => {
    expect(validateProfile('2026.1:RNBQKBNR/PPPPPPPP/8', rs).some((i) => i.code === 'KING_COUNT')).toBe(false);
  });
  it('fail: no king', () => {
    expect(validateProfile('2026.1:RNBQ1BNR/PPPPPPPP/8', rs).some((i) => i.code === 'KING_COUNT')).toBe(true);
  });
  it('fail: two kings', () => {
    expect(validateProfile('2026.1:RNBQKBNK/8/PPPPPPPP', rs).some((i) => i.code === 'KING_COUNT')).toBe(true);
  });
  it('fail: king not on rank 1', () => {
    expect(validateProfile('2026.1:RNBQ1BNR/PPPPPPPP/4K3', rs).some((i) => i.code === 'KING_RANK')).toBe(true);
  });
});

describe('validateProfile: OVER_BUDGET / MAX_COUNT', () => {
  it('pass: vanilla costs exactly the pool', () => {
    expect(validateProfile('2026.1:RNBQKBNR/PPPPPPPP/8', rs).some((i) => i.code === 'OVER_BUDGET')).toBe(false);
  });
  it('fail: two queens over budget and max count', () => {
    const issues = validateProfile('2026.1:QNBQKBNR/PPPPPPPP/8', rs);
    expect(issues.some((i) => i.code === 'MAX_COUNT')).toBe(true);
  });
});

describe('validateProfile: PAWN_LAST_RANK', () => {
  it('pass: no pawn on rank 3 of the zone', () => {
    expect(validateProfile('2026.1:RNBQKBNR/PPPPPPPP/8', rs).some((i) => i.code === 'PAWN_LAST_RANK')).toBe(false);
  });
  it('fail: pawn placed on the zone\'s last rank', () => {
    expect(validateProfile('2026.1:RNBQKBNR/PPPPPPP1/7P', rs).some((i) => i.code === 'PAWN_LAST_RANK')).toBe(true);
  });
});

describe('kingSafety: fixtures', () => {
  function parseAndCheck(setupStr: string, color: 'w' | 'b' = 'w') {
    return kingSafety(parseSetup(setupStr), rs, color);
  }

  it('vanilla setup is safe', () => {
    expect(parseAndCheck('2026.1:RNBQKBNR/PPPPPPPP/8')).toEqual([]);
  });
  it('library example (warden) is safe', () => {
    expect(parseAndCheck('2026.1:R1BQKB{warden}1/PPPPPPPP/2N2N2')).toEqual([]);
  });
  it('removing the e-pawn exposes the e-file', () => {
    const exposures = parseAndCheck('2026.1:RNBQKBNR/PPPP1PPP/8');
    expect(exposures.some((e) => e.kind === 'file' && e.line === 'e-file')).toBe(true);
  });
  it('removing a blocking pawn exposes a long diagonal (king near a corner)', () => {
    // King on c1; d-pawn removed opens the c1-h6 diagonal for an enemy bishop at h6.
    const exposures = parseAndCheck('2026.1:RNK2BNR/PPP1PPPP/8');
    expect(exposures.some((e) => e.kind === 'diagonal')).toBe(true);
  });
  it('king on a1 with b2 empty exposes the long diagonal', () => {
    const exposures = parseAndCheck('2026.1:KNBQ1BNR/P1PPPPPP/8');
    expect(exposures.some((e) => e.kind === 'diagonal')).toBe(true);
  });
  it('enemy lancer forward-slides down the file to expose the king', () => {
    // Lancer is in the ruleset; its enemy forward slide (toward the player) covers the file
    // whenever that file is empty in front of the king from the enemy zone to the king.
    const exposures = parseAndCheck('2026.1:RNBQKBNR/PPPP1PPP/8');
    const lancerHit = exposures.find((e) => e.kind === 'file' && e.line === 'e-file');
    expect(lancerHit).toBeDefined();
    expect(lancerHit!.attackers.some((a) => a.pieceId === 'lancer')).toBe(true);
  });
  it('black color mapping reports absolute squares on ranks 6-8', () => {
    const exposures = parseAndCheck('2026.1:RNBQKBNR/PPPP1PPP/8', 'b');
    const fileExp = exposures.find((e) => e.kind === 'file' && e.line === 'e-file');
    expect(fileExp).toBeDefined();
    // king on e8 = square 60; all squares should be in 0..63 and on black's side
    for (const sq of fileExp!.squares) expect(sq).toBeGreaterThanOrEqual(0);
    expect(fileExp!.squares).toContain(60); // e8
  });
});

describe('validateProfile: KING_EXPOSED integration', () => {
  it('pass: vanilla setup has no KING_EXPOSED', () => {
    expect(validateProfile('2026.1:RNBQKBNR/PPPPPPPP/8', rs).some((i) => i.code === 'KING_EXPOSED')).toBe(false);
  });
  it('fail: missing e-pawn produces KING_EXPOSED', () => {
    expect(validateProfile('2026.1:RNBQKBNR/PPPP1PPP/8', rs).some((i) => i.code === 'KING_EXPOSED')).toBe(true);
  });
});

describe('hasErrors', () => {
  it('true when any error present', () => {
    expect(hasErrors([{ severity: 'error', code: 'X', message: 'm', squares: [] }])).toBe(true);
  });
  it('false for warnings only', () => {
    expect(hasErrors([{ severity: 'warning', code: 'X', message: 'm', squares: [] }])).toBe(false);
  });
});

describe('performance', () => {
  it('validateProfile runs well under 50ms', () => {
    const start = performance.now();
    for (let i = 0; i < 20; i++) validateProfile('2026.1:R1BQKB{warden}1/PPPPPPPP/2N2N2', rs);
    const elapsed = (performance.now() - start) / 20;
    expect(elapsed).toBeLessThan(50);
  });
});

describe('property: validateProfile never crashes, squares always in range', () => {
  const classicLetters = 'KQRBNP';
  const rankArb = fc.array(fc.constantFrom(...classicLetters.split('')), { minLength: 0, maxLength: 8 }).map((arr) => {
    // pad/truncate to make a plausible (possibly invalid) 8-file rank string, mixing in digits
    let out = '';
    let used = 0;
    for (const ch of arr) {
      if (used >= 8) break;
      out += ch;
      used++;
    }
    if (used < 8) out += String(8 - used);
    return out;
  });

  it('fuzzed setups never throw and all squares are within 0..63', () => {
    fc.assert(
      fc.property(rankArb, rankArb, rankArb, (r1, r2, r3) => {
        const setupStr = `2026.1:${r1}/${r2}/${r3}`;
        const issues = validateProfile(setupStr, rs);
        for (const issue of issues) {
          for (const sq of issue.squares) {
            expect(sq).toBeGreaterThanOrEqual(0);
            expect(sq).toBeLessThanOrEqual(63);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
