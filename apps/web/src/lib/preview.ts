// Pure move-preview math for the Library screen (empty board, piece owned by White).
import { expandPiece, canMove, canCapture, type Piece } from '@takes/library';

export type PreviewMode = 'all' | 'moves' | 'captures';
export type PreviewMark = 'quiet' | 'capture' | 'both';

/**
 * Destinations from `from` on an empty board. A square reachable both as a quiet move and as a
 * capture is 'both'. `rank2` vectors (vanilla pawn double step) only apply from relative rank 2.
 * `mode` filters to quiet moves or to capture (attack) squares.
 */
export function previewMarks(piece: Piece, from: number, mode: PreviewMode = 'all'): Map<number, PreviewMark> {
  const quiet = new Set<number>();
  const capture = new Set<number>();
  const fromFile = from % 8;
  const fromRank = Math.floor(from / 8);
  for (const v of expandPiece(piece, 'w')) {
    if (v.cond === 'rank2' && fromRank !== 1) continue;
    for (let step = 1; step <= Math.min(v.range, 8); step++) {
      const f = fromFile + v.dx * step;
      const r = fromRank + v.dy * step;
      if (f < 0 || f > 7 || r < 0 || r > 7) break;
      const sq = r * 8 + f;
      if (canMove(v)) quiet.add(sq);
      if (canCapture(v)) capture.add(sq);
    }
  }
  const out = new Map<number, PreviewMark>();
  for (const sq of new Set([...quiet, ...capture])) {
    const q = quiet.has(sq);
    const c = capture.has(sq);
    if (mode === 'moves' && !q) continue;
    if (mode === 'captures' && !c) continue;
    out.set(sq, mode === 'moves' ? 'quiet' : mode === 'captures' ? 'capture' : q && c ? 'both' : q ? 'quiet' : 'capture');
  }
  return out;
}
