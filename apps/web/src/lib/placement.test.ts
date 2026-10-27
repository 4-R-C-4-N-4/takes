import { expect, it } from 'vitest';
import { afterTapPlacement, tapSelect, consumeSelection } from './drag.js';

it('keeps palette selection for repeated tap placements', () => {
  let state = tapSelect({ kind: 'palette', pieceId: 'pawn' });
  for (let i = 0; i < 8; i++) {
    const source = consumeSelection(state)!;
    expect(source).toEqual({ kind: 'palette', pieceId: 'pawn' });
    state = afterTapPlacement(source);
  }
  expect(state.mode).toBe('selected');
});

it('clears selection after moving a piece already on the board', () => {
  expect(afterTapPlacement({ kind: 'board', fromCell: 8 })).toEqual({ mode: 'idle' });
});
