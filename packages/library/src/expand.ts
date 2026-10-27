import type { Color, Component, Dir, Piece, Vector } from './types.js';

/** Owner-relative direction label of a vector [impl.md "Expanding components"]. */
export function dirLabel(dx: number, dy: number): Dir | null {
  if (dx === 0 && dy > 0) return 'f';
  if (dx === 0 && dy < 0) return 'b';
  if (dy === 0 && dx < 0) return 'l';
  if (dy === 0 && dx > 0) return 'r';
  if (dy > 0 && dx < 0) return 'fl';
  if (dy > 0 && dx > 0) return 'fr';
  if (dy < 0 && dx < 0) return 'bl';
  if (dy < 0 && dx > 0) return 'br';
  return null;
}

/** All sign and axis-swap variants of (dx,dy), deduped, owner-relative. */
export function symmetryVariants(dx: number, dy: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const [a, b] of [[dx, dy], [dy, dx]] as const) {
    for (const sa of [1, -1]) for (const sb of [1, -1]) {
      const v: [number, number] = [a * sa + 0, b * sb + 0];
      const k = v.join(',');
      if (!seen.has(k)) { seen.add(k); out.push(v); }
    }
  }
  return out;
}

/** Expand one component into owner-relative vectors. */
export function expandComponentRelative(c: Component): Array<[number, number]> {
  const all = symmetryVariants(c.vec[0], c.vec[1]);
  if (c.sym === 'all') return all;
  const keep = new Set<Dir>(c.sym);
  return all.filter(([dx, dy]) => { const l = dirLabel(dx, dy); return l !== null && keep.has(l); });
}

/**
 * Expand a piece into absolute vectors for a color. Black flips dy only; files are never mirrored.
 * Identical (dx,dy,range,path,mode,cond) entries are deduped.
 */
export function expandPiece(p: Piece, color: Color): Vector[] {
  const out: Vector[] = [];
  const seen = new Set<string>();
  for (const c of p.components) {
    for (const [dx, rdy] of expandComponentRelative(c)) {
      const dy = color === 'w' ? rdy : -rdy + 0;
      const v: Vector = { dx, dy, range: c.range, path: c.path, mode: c.mode };
      if (c.cond) v.cond = c.cond;
      const k = `${dx},${dy},${c.range},${c.path},${c.mode},${c.cond ?? ''}`;
      if (!seen.has(k)) { seen.add(k); out.push(v); }
    }
  }
  return out;
}

export const canMove = (v: Vector) => v.mode !== 'capture';
export const canCapture = (v: Vector) => v.mode !== 'move';
