/** Component-level enumeration for the piece catalog [docs/catalog/PLAN.md step 1]. */
import type { Component, Dir, Mode, PathType } from '@takes/library';

const ORTHO_DIRS: Dir[] = ['f', 'b', 'l', 'r'];
const DIAG_DIRS: Dir[] = ['fl', 'fr', 'bl', 'br'];
const MODES: Mode[] = ['move', 'capture', 'both'];
const SLIDE_RANGES = [1, 2, 3, Infinity];

function nonEmptySubsets<T>(items: T[]): T[][] {
  const out: T[][] = [];
  const n = items.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset: T[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(items[i]!);
    out.push(subset);
  }
  return out;
}

function symFor(dirs: Dir[], universe: Dir[]): 'all' | Dir[] {
  return dirs.length === universe.length ? 'all' : dirs;
}

/** Unit-slide atoms (W, F) at all ranges/dir-subsets/modes. */
function slideComponents(vec: [number, number], universe: Dir[]): Component[] {
  const out: Component[] = [];
  for (const dirs of nonEmptySubsets(universe)) {
    for (const range of SLIDE_RANGES) {
      for (const mode of MODES) {
        out.push({ vec, sym: symFor(dirs, universe), range, path: 'slide', mode });
      }
    }
  }
  return out;
}

/** Leap atoms (D, A) at range 1, all dir-subsets/modes. */
function leapComponents(vec: [number, number], universe: Dir[]): Component[] {
  const out: Component[] = [];
  for (const dirs of nonEmptySubsets(universe)) {
    for (const mode of MODES) {
      out.push({ vec, sym: symFor(dirs, universe), range: 1, path: 'leap', mode });
    }
  }
  return out;
}

/** N leaps: FSF Betza directional subsets are unsupported (oblique atom), so only the full leap survives. */
function knightComponents(): Component[] {
  const out: Component[] = [];
  for (const mode of MODES) out.push({ vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode });
  return out;
}

/** All single-component options expressible in the schema and (mostly) in FSF Betza. */
export function enumerateComponents(): Component[] {
  return [
    ...slideComponents([0, 1], ORTHO_DIRS), // W
    ...slideComponents([1, 1], DIAG_DIRS), // F
    ...leapComponents([0, 2], ORTHO_DIRS), // D
    ...leapComponents([2, 2], DIAG_DIRS), // A
    ...knightComponents(), // N
  ];
}

/** Stable sort key for a single component, used to dedupe/combine. */
export function componentKey(c: Component): string {
  const sym = c.sym === 'all' ? 'all' : [...c.sym].sort().join('');
  const range = c.range === Infinity ? 'inf' : String(c.range);
  return `${c.vec[0]},${c.vec[1]}|${sym}|${range}|${c.path}|${c.mode}`;
}

export function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const n = items.length;
  const idx: number[] = [];
  function rec(start: number) {
    if (idx.length === k) { out.push(idx.map((i) => items[i]!)); return; }
    for (let i = start; i < n; i++) { idx.push(i); rec(i + 1); idx.pop(); }
  }
  rec(0);
  return out;
}

export type PathTypeT = PathType;
