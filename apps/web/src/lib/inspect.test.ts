import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { inspectMarks, type InspectPiece } from './inspect.js';
const rules = getRuleset('2026.3')!;
const sq = (s: string) => (Number(s[1]) - 1) * 8 + 'abcdefgh'.indexOf(s[0]!);
function board(...pieces: [string, string, 'w' | 'b'][]): (InspectPiece | null)[] {
  const b = Array<InspectPiece | null>(64).fill(null);
  for (const [s, pieceId, color] of pieces) b[sq(s)] = { pieceId, color };
  return b;
}
describe('inspectMarks', () => {
  it('stops rook rays at friendly and enemy blockers, and marks the friendly piece it guards', () => {
    const marks = inspectMarks(rules, board(['d4', 'rook', 'w'], ['d6', 'pawn', 'w'], ['f4', 'pawn', 'b']), sq('d4'));
    expect(marks.get(sq('d5'))).toBe('both');
    // The rook protects its own pawn on d6: if anything takes there, the rook can take back.
    expect(marks.get(sq('d6'))).toBe('capture');
    expect(marks.has(sq('d7'))).toBe(false);
    expect(marks.get(sq('f4'))).toBe('capture');
    expect(marks.has(sq('g4'))).toBe(false);
  });
  it('knights leap over blockers but cannot land on friendly pieces', () => {
    const marks = inspectMarks(rules, board(['d4', 'knight', 'w'], ['d5', 'pawn', 'w'], ['e6', 'pawn', 'b'], ['c6', 'pawn', 'w']), sq('d4'));
    expect(marks.get(sq('e6'))).toBe('capture');
    expect(marks.get(sq('f5'))).toBe('both');
    expect(marks.get(sq('c6'))).toBe('capture'); // guards its own pawn
    expect(marks.get(sq('d5'))).toBeUndefined(); // the knight neither moves nor captures on d5
  });
  it('guards only along capturing lines: a pawn protects diagonally, never straight ahead', () => {
    const marks = inspectMarks(rules, board(['e2', 'pawn', 'w'], ['d3', 'knight', 'w'], ['e3', 'bishop', 'w']), sq('e2'));
    expect(marks.get(sq('d3'))).toBe('capture');
    expect(marks.has(sq('e3'))).toBe(false);
    expect(marks.has(sq('e4'))).toBe(false);
  });
  it('Black pawns move down, attack diagonals and double only on relative rank 2', () => {
    const marks = inspectMarks(rules, board(['e7', 'pawn', 'b']), sq('e7'));
    expect([...marks]).toEqual(expect.arrayContaining([[sq('e6'), 'quiet'], [sq('e5'), 'quiet'], [sq('d6'), 'capture'], [sq('f6'), 'capture']]));
    expect(marks.size).toBe(4);
    expect(inspectMarks(rules, board(['e6', 'pawn', 'b']), sq('e6')).has(sq('e4'))).toBe(false);
    expect(inspectMarks(rules, board(['e7', 'pawn', 'b'], ['e6', 'pawn', 'w']), sq('e7')).has(sq('e5'))).toBe(false);
  });
  it('orients Black Triton forward rays down and limits them to three squares', () => {
    const marks = inspectMarks(rules, board(['d7', 'triton', 'b']), sq('d7'));
    expect(marks.get(sq('d4'))).toBe('both');
    expect(marks.get(sq('g4'))).toBe('both');
    expect(marks.has(sq('d3'))).toBe(false);
    expect(marks.has(sq('d8'))).toBe(false);
  });
  it('handles fixed kings and empty squares', () => {
    expect(inspectMarks(rules, board(['d4', 'king', 'w']), sq('d4')).size).toBe(8);
    expect(inspectMarks(rules, board(), sq('d4')).size).toBe(0);
  });
});
