// Retrograde analysis of "piece X (with or without its own king) against a lone king".
// Answers the super-major question: which pieces can force checkmate unassisted?
//
// Rules modelled (standard chess endgame rules, with Takes piece movement):
// - The defending king may not move into check and may capture X when X is undefended.
// - Capturing X, or stalemate, is a draw. Checkmate (king in check, no legal move) is a win.
// - X attacks along its capture vectors. Sliders are blocked by either king. When the defending
//   king steps along X's line, the square behind it stays attacked (the king does not shield
//   itself), which is why X's attacks are computed with the defending king removed.
// - The attacking king, when present, never stands next to the defending king or in check.
// - Pawn-tier pieces are out of scope (no promotion modelling).
import { expandPiece, type Piece, type Vector } from '@takes/library';

const N = 64;
const fileOf = (s: number) => s % 8;
const rankOf = (s: number) => s >> 3;
const kingAdj = (a: number, b: number) => a !== b && Math.abs(fileOf(a) - fileOf(b)) <= 1 && Math.abs(rankOf(a) - rankOf(b)) <= 1;
const KING_STEPS: number[][] = [...Array(N).keys()].map((s) => [...Array(N).keys()].filter((t) => kingAdj(s, t)));

interface Ray { dx: number; dy: number; range: number; slide: boolean; move: boolean; capture: boolean }

function raysOf(piece: Piece): Ray[] {
  return expandPiece(piece, 'w')
    .filter((v: Vector) => v.cond !== 'rank2')
    .map((v: Vector) => ({
      dx: v.dx, dy: v.dy, range: v.path === 'leap' ? 1 : Math.min(v.range, 7), slide: v.path === 'slide',
      move: v.mode !== 'capture', capture: v.mode !== 'move',
    }));
}

/** Squares X on `from` reaches. `blocked(sq)` stops slides (the blocking square itself is included). */
function walk(rays: Ray[], from: number, blocked: (sq: number) => boolean, want: 'move' | 'capture', out: (sq: number) => void): void {
  for (const r of rays) {
    if (want === 'move' ? !r.move : !r.capture) continue;
    for (let s = 1; s <= r.range; s++) {
      const f = fileOf(from) + r.dx * s, k = rankOf(from) + r.dy * s;
      if (f < 0 || f > 7 || k < 0 || k > 7) break;
      const sq = k * 8 + f;
      out(sq);
      if (r.slide && blocked(sq)) break;
    }
  }
}

export interface MateReport {
  /** Share of legal attacker-to-move positions (X safe, not yet mate) that are forced wins. */
  winShare: number;
  /** Longest forced mate found, in attacker moves. */
  longestMate: number;
  /** Whether any checkmate position exists at all (e.g. only with the king in a corner). */
  mateExists: number;
  /** Corner-mate: share of positions with the defending king in a corner that are forced wins. */
  cornerWinShare: number;
}

/**
 * Unassisted: X alone (no attacking king) vs lone king. Positions: X square x, defending king b.
 * Assisted: attacking king w + X vs lone king.
 */
export function analyseMate(piece: Piece, assisted: boolean): MateReport {
  const rays = raysOf(piece);
  // Index: w (0..63, or 0 when unassisted), x, b, side (0 = attacker to move, 1 = defender to move).
  const W = assisted ? N : 1;
  const idx = (w: number, x: number, b: number, side: number) => (((w * N + x) * N + b) << 1) | side;
  const size = W * N * N * 2;
  const result = new Int16Array(size); // 0 unknown, >0: win in n plies (attacker perspective)
  const legal = new Uint8Array(size);

  const xAttacks = (w: number, x: number, ignoreB: number | null): Uint8Array => {
    const a = new Uint8Array(N);
    walk(rays, x, (sq) => (assisted && sq === w) || (ignoreB === null ? false : false), 'capture', (sq) => { a[sq] = 1; });
    return a;
  };
  // Precompute X attack sets with only the attacking king as blocker (defending king removed).
  const attackCache = new Map<number, Uint8Array>();
  const attacksOf = (w: number, x: number) => {
    const key = w * N + x;
    let a = attackCache.get(key);
    if (!a) { a = xAttacks(w, x, null); attackCache.set(key, a); }
    return a;
  };
  const defended = (w: number, x: number) => assisted && kingAdj(w, x);
  const inCheck = (w: number, x: number, b: number) => {
    // Check from X: X's ray toward b blocked only by the attacking king.
    return attacksOf(w, x)[b] === 1;
  };
  const blackMoves = (w: number, x: number, b: number): Array<{ to: number; capture: boolean }> => {
    const out: Array<{ to: number; capture: boolean }> = [];
    const att = attacksOf(w, x);
    for (const t of KING_STEPS[b]!) {
      if (assisted && (t === w || kingAdj(t, w))) continue;
      if (t === x) { if (!defended(w, x)) out.push({ to: t, capture: true }); continue; }
      if (att[t]) continue;
      out.push({ to: t, capture: false });
    }
    return out;
  };

  // Legality + terminal mates.
  let mateExists = 0;
  for (let w = 0; w < W; w++) for (let x = 0; x < N; x++) for (let b = 0; b < N; b++) {
    if (x === b || (assisted && (w === x || w === b || kingAdj(w, b)))) continue;
    // Attacker to move: defender must not be in check (it would be capturable).
    if (!inCheck(w, x, b)) legal[idx(w, x, b, 0)] = 1;
    legal[idx(w, x, b, 1)] = 1;
    if (inCheck(w, x, b) && blackMoves(w, x, b).length === 0) { result[idx(w, x, b, 1)] = 1; mateExists = 1; }
  }

  // Attacker moves from (w, x, b): X moves (not onto kings), king moves (assisted).
  const whiteSuccessors = (w: number, x: number, b: number, visit: (w2: number, x2: number) => void) => {
    walk(rays, x, (sq) => sq === b || (assisted && sq === w), 'move', (sq) => {
      if (sq === b || (assisted && sq === w)) return;
      visit(w, sq);
    });
    if (assisted) for (const t of KING_STEPS[w]!) {
      if (t === x || t === b || kingAdj(t, b)) continue;
      visit(t, x);
    }
  };

  // Fixed-point iteration (plies). Positions left at 0 are draws.
  let changed = true; let ply = 1;
  while (changed && ply < 400) {
    changed = false; ply++;
    for (let w = 0; w < W; w++) for (let x = 0; x < N; x++) for (let b = 0; b < N; b++) {
      if (ply % 2 === 0) {
        const i = idx(w, x, b, 0);
        if (!legal[i] || result[i]) continue;
        let win = false;
        whiteSuccessors(w, x, b, (w2, x2) => {
          if (win) return;
          const j = idx(w2, x2, b, 1);
          if (legal[j] && result[j] > 0 && result[j] < ply) win = true;
        });
        if (win) { result[i] = ply; changed = true; }
      } else {
        const i = idx(w, x, b, 1);
        if (!legal[i] || result[i]) continue;
        const moves = blackMoves(w, x, b);
        if (moves.length === 0) continue; // stalemate (mates were seeded)
        let allLose = true;
        for (const m of moves) {
          if (m.capture) { allLose = false; break; }
          const j = idx(w, x, m.to, 0);
          if (!(legal[j] && result[j] > 0 && result[j] < ply)) { allLose = false; break; }
        }
        if (allLose) { result[i] = ply; changed = true; }
      }
    }
  }

  let total = 0, wins = 0, longest = 0, cornerTotal = 0, cornerWins = 0;
  const corners = new Set([0, 7, 56, 63]);
  for (let w = 0; w < W; w++) for (let x = 0; x < N; x++) for (let b = 0; b < N; b++) {
    const i = idx(w, x, b, 0);
    if (!legal[i]) continue;
    // Only count positions where X is not immediately en prise to the defending king.
    if (kingAdj(x, b) && !defended(w, x)) continue;
    total++;
    const won = result[i] > 0;
    if (won) { wins++; longest = Math.max(longest, Math.ceil(result[i] / 2)); }
    if (corners.has(b)) { cornerTotal++; if (won) cornerWins++; }
  }
  return { winShare: total ? wins / total : 0, longestMate: longest, mateExists, cornerWinShare: cornerTotal ? cornerWins / cornerTotal : 0 };
}
