/** Canonicalisation / dedup [docs/catalog/PLAN.md step 2]. */
import type { Piece, Vector } from '@takes/library';
import { expandPiece } from '@takes/library';

function vectorKey(v: Vector): string {
  const range = v.range === Infinity ? 'inf' : String(v.range);
  return `${v.dx},${v.dy},${range},${v.path},${v.mode}`;
}

/** Sorted, deduped expanded-vector key for White. */
export function vectorSetKey(vectors: Vector[]): string {
  return [...new Set(vectors.map(vectorKey))].sort().join(';');
}

/** Mirror a vector set across the file axis (dx -> -dx). */
function mirror(vectors: Vector[]): Vector[] {
  return vectors.map((v) => ({ ...v, dx: -v.dx }));
}

/**
 * Canonical key for a piece's expanded White vector set: merge left/right
 * mirror images into one entry by keeping the lexicographically smaller key.
 */
export function canonicalKey(piece: Piece): string {
  const vectors = expandPiece(piece, 'w');
  const own = vectorSetKey(vectors);
  const mirrored = vectorSetKey(mirror(vectors));
  return own <= mirrored ? own : mirrored;
}

/**
 * Merge a move-only and capture-only component pair with identical vector
 * geometry into a single 'both' component (same vec/sym/range/path).
 */
export function mergeMoveCapture<C extends { vec: [number, number]; sym: 'all' | string[]; range: number; path: string; mode: string }>(
  components: C[],
): C[] {
  const bySignature = new Map<string, C[]>();
  for (const c of components) {
    const sym = c.sym === 'all' ? 'all' : [...c.sym].sort().join('');
    const sig = `${c.vec[0]},${c.vec[1]}|${sym}|${c.range}|${c.path}`;
    const list = bySignature.get(sig) ?? [];
    list.push(c);
    bySignature.set(sig, list);
  }
  const out: C[] = [];
  for (const list of bySignature.values()) {
    const move = list.find((c) => c.mode === 'move');
    const capture = list.find((c) => c.mode === 'capture');
    const both = list.find((c) => c.mode === 'both');
    if (both) { out.push(both); continue; }
    if (move && capture) { out.push({ ...move, mode: 'both' }); continue; }
    for (const c of list) out.push(c);
  }
  return out;
}
