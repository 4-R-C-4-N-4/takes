import { describe, it, expect } from 'vitest';
import { describePiece } from './describePiece.js';
import type { Piece } from '@takes/library';

function piece(components: Piece['components']): Piece {
  return { id: 't', name: 'Test', glyph: 'T', tier: 'minor', components };
}

describe('describePiece', () => {
  it('rook: slides any distance orthogonally', () => {
    expect(describePiece(piece([{ vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'both' }])))
      .toBe('Slides any distance orthogonally.');
  });

  it('bishop: slides any distance diagonally', () => {
    expect(describePiece(piece([{ vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' }])))
      .toBe('Slides any distance diagonally.');
  });

  it('knight: leaps in an L-shape', () => {
    expect(describePiece(piece([{ vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'both' }])))
      .toBe('Leaps in an L-shape (knight move).');
  });

  it('wraith: split move/capture components as separate sentences', () => {
    const wraith = piece([
      { vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'move' },
      { vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'capture' },
    ]);
    expect(describePiece(wraith)).toBe(
      'Slides any distance orthogonally, without capturing. Slides any distance diagonally, capture only.',
    );
  });

  it('pawn: forward step, rank-2 double step, diagonal capture', () => {
    const pawn = piece([
      { vec: [0, 1], sym: ['f'], range: 1, path: 'slide', mode: 'move' },
      { vec: [0, 1], sym: ['f'], range: 2, path: 'slide', mode: 'move', cond: 'rank2' },
      { vec: [1, 1], sym: ['fl', 'fr'], range: 1, path: 'slide', mode: 'capture' },
    ]);
    const text = describePiece(pawn);
    expect(text).toContain('forward only, without capturing');
    expect(text).toContain('from its starting square');
    expect(text).toContain('capture only');
  });

  it('piece with no components does not move', () => {
    expect(describePiece(piece([]))).toBe('Does not move.');
  });

  it('short leap over pieces mentions jumping', () => {
    const grasshopper = piece([{ vec: [1, 0], sym: 'all', range: 3, path: 'leap', mode: 'both' }]);
    expect(describePiece(grasshopper)).toContain('over pieces');
  });
});
