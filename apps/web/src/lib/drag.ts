// Drag/tap state machine for the Builder (Pointer Events: one path for mouse + touch).
export type PaletteSource = { kind: 'palette'; pieceId: string };
export type BoardSource = { kind: 'board'; fromCell: number };
export type DragSource = PaletteSource | BoardSource;

export type DragState =
  | { mode: 'idle' }
  | { mode: 'selected'; source: DragSource }
  | { mode: 'dragging'; source: DragSource; x: number; y: number };

export function idle(): DragState { return { mode: 'idle' }; }

export function startDrag(source: DragSource, x: number, y: number): DragState {
  return { mode: 'dragging', source, x, y };
}

export function moveDrag(state: DragState, x: number, y: number): DragState {
  if (state.mode !== 'dragging') return state;
  return { ...state, x, y };
}

/** Pointer-up with no movement beyond a drag threshold: treat as tap-select. */
export function tapSelect(source: DragSource): DragState {
  return { mode: 'selected', source };
}

/** Tap a second time (board cell or empty) while something is selected: place/remove. */
export function consumeSelection(state: DragState): DragSource | null {
  if (state.mode === 'selected' || state.mode === 'dragging') return state.source;
  return null;
}

export function cancel(): DragState { return idle(); }
