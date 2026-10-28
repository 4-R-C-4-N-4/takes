import { expandPiece, canMove, canCapture, type Color, type Piece, type Ruleset } from '@takes/library';
import type { PreviewMark } from './preview.js';

export interface InspectPiece { pieceId: string; color: Color }
export const INSPECT_KING: Piece = {
  id: 'king', name: 'King', glyph: 'K', tier: 'major',
  components: [
    { vec: [1, 0], sym: 'all', range: 1, path: 'slide', mode: 'both' },
    { vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
  ],
};

/** Movement and attacks, without turn, check, castling or en-passant legality.
 * Empty attacked squares get rings too; friendly occupied squares stop the ray.
 * Movement history is unavailable, so rank2 depends only on relative rank.
 */
export function inspectMarks(ruleset: Ruleset, board: readonly (InspectPiece | null)[], from: number): Map<number, PreviewMark> {
  const out = new Map<number, PreviewMark>();
  const owner = board[from];
  if (!owner) return out;
  const piece = owner.pieceId === 'king' ? INSPECT_KING : ruleset.pieces[owner.pieceId];
  if (!piece) return out;
  const rank = Math.floor(from / 8);
  for (const v of expandPiece(piece, owner.color)) {
    if (v.cond === 'rank2' && rank !== (owner.color === 'w' ? 1 : 6)) continue;
    for (let step = 1; step <= (v.path === 'leap' ? 1 : Math.min(v.range, 8)); step++) {
      const f = from % 8 + v.dx * step, r = rank + v.dy * step;
      if (f < 0 || f > 7 || r < 0 || r > 7) break;
      const sq = r * 8 + f, target = board[sq];
      const quiet = !target && canMove(v);
      const capture = target?.color !== owner.color && canCapture(v);
      if (quiet || capture) {
        const mark = quiet && capture ? 'both' : quiet ? 'quiet' : 'capture';
        const prior = out.get(sq);
        out.set(sq, prior && prior !== mark ? 'both' : mark);
      }
      if (target) break;
    }
  }
  return out;
}
