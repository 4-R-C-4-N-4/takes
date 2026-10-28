// In-browser sparring bot for test drives. Pure Takes engine (no Fairy-Stockfish, so no GPL concern
// and it understands any sandbox piece). Deliberately simple: iterative-deepening alpha-beta on
// material with a capture-only quiescence search, bounded by a time budget.
import type { Game, Move } from '@takes/engine';
import type { Color, Ruleset } from '@takes/library';

const MATE = 100_000;
const KING_VALUE = 1_000;

export interface SparringOptions {
  /** Time budget in ms (checked between nodes). */
  timeMs?: number;
  maxDepth?: number;
  /** Value per piece id, in pawns. Defaults to ruleset costs; unknown ids count 3. */
  values?: Record<string, number>;
}

class Timeout extends Error {}

export function pieceValues(r: Ruleset, overrides: Record<string, number> = {}): Record<string, number> {
  return { ...r.costs, king: KING_VALUE, ...overrides };
}

function evaluate(game: Game, values: Record<string, number>): number {
  // From the side to move's perspective, in centipawns. Small centre bonus breaks ties.
  const me = game.sideToMove();
  let score = 0;
  const board = game.board();
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p) continue;
    const f = sq % 8, r = sq >> 3;
    const centre = 6 - (Math.abs(3.5 - f) + Math.abs(3.5 - r));
    const v = (values[p.pieceId] ?? 3) * 100 + (p.pieceId === 'king' ? 0 : centre * 2);
    score += p.color === me ? v : -v;
  }
  return score;
}

function ordered(game: Game, values: Record<string, number>): Move[] {
  const board = game.board();
  const mvv = (m: Move) => (m.captured ? (values[m.captured] ?? 3) * 10 - (values[board[m.from]?.pieceId ?? ''] ?? 3) : -100) + (m.promo ? 50 : 0);
  return game.legalMoves().sort((a, b) => mvv(b) - mvv(a));
}

/** Best move for the side to move, or null if it has none. Mutates and restores `game`. */
export function chooseMove(game: Game, opts: SparringOptions = {}): Move | null {
  const values = opts.values ?? pieceValues(game.ruleset);
  const deadline = Date.now() + (opts.timeMs ?? 700);
  const maxDepth = opts.maxDepth ?? 6;
  let nodes = 0;
  const tick = () => { if ((++nodes & 255) === 0 && Date.now() > deadline) throw new Timeout(); };

  function quiesce(alpha: number, beta: number, depth: number): number {
    tick();
    const stand = evaluate(game, values);
    if (stand >= beta || depth > 4) return stand;
    if (stand > alpha) alpha = stand;
    for (const m of ordered(game, values)) {
      if (!m.captured && !m.promo) continue;
      game.make(m);
      let s: number;
      try { s = -quiesce(-beta, -alpha, depth + 1); } finally { game.unmake(); } // timeouts unwind cleanly
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  function search(depth: number, alpha: number, beta: number, ply: number): number {
    tick();
    const moves = ordered(game, values);
    if (moves.length === 0) return game.inCheck() ? -MATE + ply : 0;
    if (depth === 0) return quiesce(alpha, beta, 0);
    let best = -Infinity;
    for (const m of moves) {
      game.make(m);
      let s: number;
      try { s = -search(depth - 1, -beta, -alpha, ply + 1); } finally { game.unmake(); }
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) break;
    }
    return best;
  }

  const root = ordered(game, values);
  if (root.length === 0) return null;
  let best: Move = root[0]!;
  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestThis: Move | null = null;
    let alpha = -Infinity;
    try {
      // Search the previous best first so a partial iteration still improves on it.
      for (const m of [best, ...root.filter((x) => x !== best)]) {
        game.make(m);
        let s: number;
        try { s = -search(depth - 1, -Infinity, -alpha, 1); } finally { game.unmake(); }
        if (s > alpha) { alpha = s; bestThis = m; }
      }
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    if (bestThis) best = bestThis;
    if (alpha >= MATE - 100) break;
  }
  return best;
}

export type CpuSide = Color | null;
