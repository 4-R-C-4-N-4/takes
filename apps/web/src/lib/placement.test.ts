import { expect, it } from 'vitest';
import { paletteGesture, afterTapPlacement, tapSelect, consumeSelection } from './drag.js';

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

it.each(['touch', 'pen'])('%s palette gestures distinguish taps, holds, horizontal drags and scrolling', (pointerType) => {
  expect(paletteGesture(pointerType, 0, 0, 0)).toBe('tap');
  expect(paletteGesture(pointerType, 249, 3, 2)).toBe('tap');
  expect(paletteGesture(pointerType, 250, 3, 2)).toBe('drag');
  expect(paletteGesture(pointerType, 20, -12, 3)).toBe('drag');
  expect(paletteGesture(pointerType, 20, 12, 3)).toBe('drag');
  expect(paletteGesture(pointerType, 20, 3, -10)).toBe('scroll');
  expect(paletteGesture(pointerType, 300, 3, 10)).toBe('scroll');
  expect(paletteGesture(pointerType, 100, 8, 7)).toBe('pending');
});

it('keeps the mouse six pixel drag threshold without a hold', () => {
  expect(paletteGesture('mouse', 500, 0, 0)).toBe('tap');
  expect(paletteGesture('mouse', 0, 6, 0)).toBe('drag');
  expect(paletteGesture('mouse', 0, 0, 6)).toBe('drag');
});
