import { describe, expect, it } from 'vitest';
import { getRuleset } from '@takes/library';
import { previewMarks } from './preview.js';

const r = getRuleset('2026.2')!;
const sq = (s: string) => (Number(s[1]) - 1) * 8 + 'abcdefgh'.indexOf(s[0]!);

describe('previewMarks', () => {
  it('shows squares a piece both moves to and captures on as "both" (attacks were hidden before)', () => {
    const m = previewMarks(r.pieces.rook!, sq('d4'));
    expect(m.get(sq('d8'))).toBe('both');
    expect([...m.values()].every((x) => x === 'both')).toBe(true);
  });
  it('captures view lists attacked squares; moves view lists quiet squares', () => {
    const pawn = r.pieces.pawn!;
    const caps = previewMarks(pawn, sq('e2'), 'captures');
    expect([...caps.keys()].sort()).toEqual([sq('d3'), sq('f3')].sort());
    const moves = previewMarks(pawn, sq('e2'), 'moves');
    expect([...moves.keys()].sort()).toEqual([sq('e3'), sq('e4')].sort());
  });
  it('pawn double step only from rank 2', () => {
    expect(previewMarks(r.pieces.pawn!, sq('e3'), 'moves').has(sq('e5'))).toBe(false);
  });
  it('split pieces: wraith moves orthogonally, captures diagonally', () => {
    const m = previewMarks(r.pieces.wraith!, sq('d4'));
    expect(m.get(sq('d6'))).toBe('quiet');
    expect(m.get(sq('f6'))).toBe('capture');
  });
});
