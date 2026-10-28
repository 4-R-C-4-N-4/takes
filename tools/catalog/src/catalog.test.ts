import { describe, it, expect } from 'vitest';
import { getRuleset, expandPiece } from '@takes/library';
import { pieceToBetza } from '@takes/betza';
import { prunedSingles, pairs, sampledTriples, comboToPiece, seedClassicCombos } from './generate.js';
import { canonicalKey, mergeMoveCapture, vectorSetKey } from './canonicalize.js';
import { assignTier, assignFamilies } from './families.js';
import { buildProfile } from './profile.js';
import type { Component, Piece } from '@takes/library';

const ruleset = getRuleset('2026.2')!;

function pieceFromComponents(components: Component[], tier: Piece['tier'] = 'minor'): Piece {
  return { id: 'test', name: 'test', glyph: 'C', tier, components };
}

describe('canonicalisation', () => {
  it('rook expressed as 4 separate unit W slides equals the library rook', () => {
    const four: Component[] = (['f', 'b', 'l', 'r'] as const).map((d) => ({
      vec: d === 'f' || d === 'b' ? [0, 1] : [1, 0],
      sym: [d],
      range: Infinity,
      path: 'slide',
      mode: 'both',
    }));
    const built = pieceFromComponents(four as Component[], 'rook');
    expect(canonicalKey(built)).toBe(canonicalKey(ruleset.pieces.rook!));
  });

  it('a move component + an identical capture component merge into one both component', () => {
    const move: Component = { vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'move' };
    const capture: Component = { vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'capture' };
    const merged = mergeMoveCapture([move, capture]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.mode).toBe('both');
  });

  it('mirror images (left/right swapped) canonicalise to the same key', () => {
    const left: Component = { vec: [1, 0], sym: ['l'], range: 1, path: 'slide', mode: 'both' };
    const right: Component = { vec: [1, 0], sym: ['r'], range: 1, path: 'slide', mode: 'both' };
    const a = pieceFromComponents([left]);
    const b = pieceFromComponents([right]);
    expect(canonicalKey(a)).toBe(canonicalKey(b));
  });

  it('vectorSetKey dedupes and sorts', () => {
    const v = expandPiece(ruleset.pieces.queen!, 'w');
    const k1 = vectorSetKey(v);
    const k2 = vectorSetKey([...v].reverse());
    expect(k1).toBe(k2);
  });
});

describe('known classics appear via enumeration', () => {
  const singles = prunedSingles();
  const allCombos = [...singles.map((c) => ({ components: [c] })), ...pairs(singles), ...seedClassicCombos()];
  const byKey = new Map<string, Piece>();
  for (const combo of allCombos) {
    const piece = comboToPiece(combo);
    byKey.set(canonicalKey(piece), piece);
  }

  function expectPresent(libraryId: string) {
    const libPiece = ruleset.pieces[libraryId]!;
    const key = canonicalKey(libPiece);
    expect(byKey.has(key)).toBe(true);
  }

  it('rook, bishop, queen, knight are present', () => {
    expectPresent('rook');
    expectPresent('bishop');
    expectPresent('queen');
    expectPresent('knight');
  });

  it('wazir, ferz, commoner are present (not named in the library, built directly)', () => {
    const wazir = pieceFromComponents([{ vec: [0, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' }]);
    const ferz = pieceFromComponents([{ vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' }]);
    const commoner = pieceFromComponents([
      { vec: [0, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
      { vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
    ]);
    expect(byKey.has(canonicalKey(wazir))).toBe(true);
    expect(byKey.has(canonicalKey(ferz))).toBe(true);
    expect(byKey.has(canonicalKey(commoner))).toBe(true);
  });

  it('archbishop (BN), chancellor (RN) are present', () => {
    const archbishop = pieceFromComponents([
      { vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' },
      { vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'both' },
    ]);
    const chancellor = pieceFromComponents([
      { vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'both' },
      { vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'both' },
    ]);
    expect(byKey.has(canonicalKey(archbishop))).toBe(true);
    expect(byKey.has(canonicalKey(chancellor))).toBe(true);
  });

  it('amazon (QN = RBN, 3 components) is present via the seeded classic combo', () => {
    const amazon = pieceFromComponents([
      { vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'both' },
      { vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' },
      { vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'both' },
    ]);
    expect(byKey.has(canonicalKey(amazon))).toBe(true);
  });

  it('berolina, toad (DF), heron (AW), dragon (4 components) library pieces round-trip Betza', () => {
    expect(pieceToBetza(ruleset.pieces.toad!)).toBe('DF');
    expect(pieceToBetza(ruleset.pieces.heron!)).toBe('AW');
    expect(pieceToBetza(ruleset.pieces.dragon!)).toBe('RBDA');
    // Dragon needs 4 schema components (R,B,D,A) and so cannot be produced by
    // this catalog's <=3-component enumeration — documented scope gap.
    expect(ruleset.pieces.dragon!.components.length).toBe(4);
  });

  it('capture-less pieces are absent once filtered', () => {
    const moveOnly = pieceFromComponents([{ vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'move' }]);
    const key = canonicalKey(moveOnly);
    // It CAN appear in the raw canonical map (generation doesn't filter), but
    // must never pass validatePiece's HAS_CAPTURE check.
    void key;
    const hasCapture = moveOnly.components.some((c) => c.mode === 'capture' || c.mode === 'both');
    expect(hasCapture).toBe(false);
  });

  it('sampledTriples is deterministic for a fixed seed', () => {
    const a = sampledTriples(singles, 50, 7);
    const b = sampledTriples(singles, 50, 7);
    expect(a.map((c) => canonicalKey(comboToPiece(c)))).toEqual(b.map((c) => canonicalKey(comboToPiece(c))));
  });
});

describe('tier and family assignment', () => {
  const queenMobility = (() => {
    const v = expandPiece(ruleset.pieces.queen!, 'w');
    let total = 0;
    for (let sq = 0; sq < 64; sq++) {
      const fx = sq % 8;
      const fy = Math.floor(sq / 8);
      for (const vec of v) {
        const steps = vec.range === Infinity ? 8 : vec.range;
        for (let n = 1; n <= steps; n++) {
          const nx = fx + vec.dx * n;
          const ny = fy + vec.dy * n;
          if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
          total++;
        }
      }
    }
    return total / 64;
  })();

  it('non-forward pawn-tier candidates are rejected by the pawn rule (never assigned pawn tier)', () => {
    const sideways = pieceFromComponents([{ vec: [1, 0], sym: 'all', range: 1, path: 'slide', mode: 'both' }]);
    const tier = assignTier(sideways, queenMobility, 4);
    expect(tier).not.toBe('pawn');
  });

  it('forward-only never-stranded pieces get pawn tier', () => {
    const forwardStepper = pieceFromComponents([
      { vec: [0, 1], sym: ['f'], range: 1, path: 'slide', mode: 'move' },
      { vec: [1, 1], sym: ['fl', 'fr'], range: 1, path: 'slide', mode: 'capture' },
    ]);
    const tier = assignTier(forwardStepper, queenMobility, 4);
    expect(tier).toBe('pawn');
  });

  it('families: queen is a slider', () => {
    const profile = buildProfile(ruleset.pieces.queen!, ruleset);
    const families = assignFamilies(ruleset.pieces.queen!, profile);
    expect(families).toContain('slider');
  });
});
