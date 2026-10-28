import { describe, it, expect } from 'vitest';
import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
import { pieceLabel, normaliseBetza } from './pieceLabel.js';
import verdicts from '../../../../docs/catalog/verdicts.json' with { type: 'json' };

const r = getRuleset(CURRENT_RULESET_VERSION)!;
const CLASSICS = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

describe('pieceLabel', () => {
  it('classics: name primary, notation secondary', () => {
    const pawn = pieceLabel(r.pieces.pawn!);
    expect(pawn.primary).toBe('Pawn');
    expect(pawn.primaryIsNotation).toBe(false);

    const knight = pieceLabel(r.pieces.knight!);
    expect(knight.primary).toBe('Knight');
    expect(knight.secondary).toBe('N');
  });

  it('every non-classic keeper: notation primary matches verdicts.json, name secondary', () => {
    const keepers = verdicts.filter((v) => v.verdict === 'keep');
    expect(keepers).toHaveLength(20);
    for (const k of keepers) {
      const id = k.name!.toLowerCase();
      const piece = r.pieces[id];
      expect(piece, id).toBeDefined();
      const label = pieceLabel(piece!);
      expect(label.primaryIsNotation, id).toBe(true);
      expect(label.primary, id).toBe(k.betza);
      expect(label.notation, id).toBe(k.betza);
      expect(label.secondary, id).toBe(k.name);
      expect(label.nickname, id).toBe(k.name);
    }
  });

  it('covers every non-classic piece in the current ruleset, not just verdicts.json entries', () => {
    for (const [id, piece] of Object.entries(r.pieces)) {
      if (CLASSICS.includes(id)) continue;
      const label = pieceLabel(piece);
      expect(label.notation.length, id).toBeGreaterThan(0);
      expect(label.primaryIsNotation, id).toBe(true);
    }
  });

  it('normaliseBetza strips the FSF documentation form for the vanilla pawn', () => {
    expect(normaliseBetza('fmWfceFifmnD')).toBe('');
    expect(normaliseBetza('B3N')).toBe('B3N');
  });
});
