/** Per-ply metric extraction for one candidate during a scenario game [req. 2].
 * Attribution: ray-walking logic adapted from @takes/engine's movegen approach (expandPiece +
 * board occupancy), kept local because it needs to run read-only mid-game without engine internals. */
import type { Color, Ruleset } from '@takes/library';
import { expandPiece } from '@takes/library';
import type { Game, Square, BoardPiece } from '@takes/engine';

function sq(file: number, rank: number): Square { return rank * 8 + file; }
function file(s: Square): number { return s % 8; }
function rank(s: Square): number { return s >> 3; }
function inBoard(f: number, rk: number): boolean { return f >= 0 && f < 8 && rk >= 0 && rk < 8; }

/** Squares a piece at `from` of `color` attacks (capture-capable) on the current board. */
export function attackedSquares(ruleset: Ruleset, pieceId: string, color: Color, from: Square, board: ReadonlyArray<BoardPiece | null>): Square[] {
  const piece = ruleset.pieces[pieceId];
  if (!piece) return [];
  const vectors = expandPiece(piece, color).filter((v) => v.mode !== 'move');
  const out: Square[] = [];
  const f0 = file(from), r0 = rank(from);
  for (const v of vectors) {
    const range = Number.isFinite(v.range) ? v.range : 8;
    for (let step = 1; step <= range; step++) {
      const f = f0 + v.dx * step, rk = r0 + v.dy * step;
      if (!inBoard(f, rk)) break;
      const target = sq(f, rk);
      const occ = board[target];
      if (occ) {
        if (occ.color !== color) out.push(target);
        if (v.path === 'slide') break; // leaps ignore blockers but still stop at first occupant
      }
      if (v.path === 'leap') continue;
    }
  }
  return out;
}

export interface CandidateSnapshot {
  moves: number;
  captures: number;
  checks: number;
  forks: number;
  alive: boolean;
}

/** Nominal value for fork purposes: ruleset cost if known, else 0 for pawn-tier, Infinity for king. */
function nominalValue(ruleset: Ruleset, pieceId: string): number {
  if (pieceId === 'king') return Infinity;
  return ruleset.costs[pieceId] ?? 0;
}

/** Call after each candidate-side ply. Returns whether this move was a capture/check/fork by the
 * candidate piece, and whether the candidate attacked a square adjacent to the enemy king (used for
 * finalAttack bookkeeping by the caller, which knows "last 6 plies" and "decisive"). */
export interface PlyObservation {
  isCapture: boolean;
  isCheck: boolean;
  isFork: boolean;
  attacksEnemyKingZone: boolean;
}

export function observeCandidatePly(
  ruleset: Ruleset,
  candidateId: string,
  color: Color,
  game: Game,
  moveCaptured: string | undefined,
  candidateSquareAfter: Square | null,
): PlyObservation {
  if (candidateSquareAfter === null) {
    return { isCapture: Boolean(moveCaptured), isCheck: false, isFork: false, attacksEnemyKingZone: false };
  }
  const board = game.board();
  const attacked = attackedSquares(ruleset, candidateId, color, candidateSquareAfter, board);
  const enemy: Color = color === 'w' ? 'b' : 'w';
  let valuable = 0;
  let kingSq: Square | null = null;
  for (const s of attacked) {
    const occ = board[s];
    if (!occ || occ.color !== enemy) continue;
    if (occ.pieceId === 'king') { valuable++; kingSq = s; continue; }
    if (nominalValue(ruleset, occ.pieceId) >= 3) valuable++;
  }
  const isCheck = game.inCheck() && game.sideToMove() === enemy;
  const isFork = valuable >= 2;
  // Enemy king zone = the king's square and its 8 neighbours.
  let attacksEnemyKingZone = false;
  if (kingSq !== null) attacksEnemyKingZone = true;
  else {
    for (const s of attacked) {
      const ekSq = findKingSquare(board, enemy);
      if (ekSq === null) break;
      const df = Math.abs(file(s) - file(ekSq));
      const dr = Math.abs(rank(s) - rank(ekSq));
      if (df <= 1 && dr <= 1) { attacksEnemyKingZone = true; break; }
    }
  }
  return { isCapture: Boolean(moveCaptured), isCheck, isFork, attacksEnemyKingZone };
}

function findKingSquare(board: ReadonlyArray<BoardPiece | null>, color: Color): Square | null {
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p && p.color === color && p.pieceId === 'king') return s as Square;
  }
  return null;
}
