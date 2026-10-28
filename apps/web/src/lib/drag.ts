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

/** Palette taps paint repeatedly; board-piece moves consume their source once. */
export function afterTapPlacement(source: DragSource): DragState {
  return source.kind === 'palette' ? tapSelect(source) : idle();
}

export function cancel(): DragState { return idle(); }

export type PaletteGesture = 'pending' | 'drag' | 'scroll' | 'tap';

/** Classify an active palette gesture; `tap` is a stationary, short release candidate.
 * The caller commits taps only on release and latches drag/scroll decisions.
 * Horizontal movement can head toward a board beside or above the palette.
 */
export function paletteGesture(pointerType: string, elapsedMs: number, dx: number, dy: number): PaletteGesture {
  const x = Math.abs(dx), y = Math.abs(dy);
  if (pointerType === 'mouse') return Math.hypot(dx, dy) >= 6 ? 'drag' : 'tap';
  if (y >= 10 && y >= x) return 'scroll';
  if (x >= 12 && x > y * 1.5) return 'drag';
  if (Math.hypot(dx, dy) < 6) return elapsedMs >= 250 ? 'drag' : 'tap';
  return 'pending';
}
