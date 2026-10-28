/**
 * Component -> Betza exporter for Fairy-Stockfish [impl.md "Betza exporter"].
 * FSF supports only a Betza subset (src/variants.ini): base atoms, direction modifiers,
 * limited/unlimited W/F/N riders, hoppers, lame leapers. There is NO `i` modifier, so the
 * vanilla pawn's rank-2 double step maps to FSF's built-in pawn (doubleStepRegion *2) [review A5].
 */
import type { Component, Dir, Piece } from '@takes/library';
import { expandComponentRelative, dirLabel, symmetryVariants, VANILLA_PAWN_ID } from '@takes/library';

export class BetzaUnsupported extends Error {}

const ATOMS: Record<string, string> = { '0,1': 'W', '1,1': 'F', '1,2': 'N', '0,2': 'D', '2,2': 'A', '0,3': 'H', '1,3': 'C', '2,3': 'Z', '3,3': 'G' };

function atomFor(vec: [number, number]): string {
  const a = Math.abs(vec[0]); const b = Math.abs(vec[1]);
  const k = `${Math.min(a, b)},${Math.max(a, b)}`;
  const atom = ATOMS[k];
  if (!atom) throw new BetzaUnsupported(`no Betza atom for vector [${vec}]`);
  return atom;
}

const ORTHO: Dir[] = ['f', 'b', 'l', 'r'];
const DIAG: Dir[] = ['fl', 'fr', 'bl', 'br'];

/** Direction prefix groups for a component. Returns list of prefixes (each yields one Betza term). */
function directionPrefixes(c: Component, atom: string): string[] {
  if (c.sym === 'all') return [''];
  const dirs = new Set<Dir>(expandComponentRelative(c).map(([dx, dy]) => dirLabel(dx, dy)!));
  const full = expandComponentRelative({ ...c, sym: 'all' }).length;
  if (dirs.size === 0) throw new BetzaUnsupported('component expands to no vectors');
  if (expandComponentRelative(c).length === full) return [''];
  if (atom === 'W' || atom === 'D' || atom === 'H') {
    const has = (d: Dir) => dirs.has(d);
    const out: string[] = [];
    if (has('f') && has('b')) out.push('v'); else { if (has('f')) out.push('f'); if (has('b')) out.push('b'); }
    if (has('l') && has('r')) out.push('s'); else { if (has('l')) out.push('l'); if (has('r')) out.push('r'); }
    return out;
  }
  if (atom === 'F' || atom === 'A' || atom === 'G') {
    const has = (d: Dir) => dirs.has(d);
    if (has('fl') && has('fr') && !has('bl') && !has('br')) return ['f'];
    if (has('bl') && has('br') && !has('fl') && !has('fr')) return ['b'];
    if (has('fl') && has('bl') && !has('fr') && !has('br')) return ['l'];
    if (has('fr') && has('br') && !has('fl') && !has('bl')) return ['r'];
    return DIAG.filter(has);
  }
  // Oblique atoms (N, C, Z): directional subsets are ambiguous in FSF Betza; reject for now.
  void ORTHO;
  throw new BetzaUnsupported(`directional oblique leaper (${atom}, ${[...dirs].join('/')}) not supported`);
}

export function componentToBetza(c: Component): string {
  const atom = atomFor(c.vec);
  if (c.cond) throw new BetzaUnsupported(`cond '${c.cond}' has no FSF Betza form (use built-in pawn)`);
  let body: string;
  if (c.path === 'leap') {
    if (c.range !== 1) throw new BetzaUnsupported('leap riders deferred');
    body = atom;
  } else {
    // slide (unit vectors per D3) — W/F based
    if (atom !== 'W' && atom !== 'F') throw new BetzaUnsupported(`slide with non-unit atom ${atom} [D3]`);
    if (c.range === 1) body = atom;
    else if (c.range === Infinity) body = atom === 'W' ? 'R' : 'B';
    else body = (atom === 'W' ? 'R' : 'B') + String(c.range);
  }
  const mode = c.mode === 'move' ? 'm' : c.mode === 'capture' ? 'c' : '';
  return directionPrefixes(c, atom).map((d) => mode + d + body).join('');
}

/**
 * FSF keeps ONE range per (atom, direction, move-type): two terms covering the same direction
 * (e.g. `mfR3` + `vR2`) lose moves. Normalise first: per atom/path/direction take the maximum
 * move range and the maximum capture range (same-direction slides nest), then regroup directions
 * with identical (moveRange, captureRange) into terms. Order follows first appearance.
 */
function normalisedComponents(p: Piece): Component[] {
  type Key = string;
  const groups = new Map<Key, { atomVec: [number, number]; path: Component['path']; mr: number; cr: number; dirs: Dir[] }>();
  const perDir = new Map<string, { atomVec: [number, number]; path: Component['path']; mr: number; cr: number; dir: Dir }>();
  for (const c of p.components) {
    if (c.cond) throw new BetzaUnsupported(`cond '${c.cond}' has no FSF Betza form (use built-in pawn)`);
    const a = Math.abs(c.vec[0]); const b = Math.abs(c.vec[1]);
    const atomVec: [number, number] = [Math.min(a, b), Math.max(a, b)];
    for (const [dx, dy] of expandComponentRelative(c)) {
      const dir = dirLabel(dx, dy);
      // Oblique atoms have no single-letter direction labels; keep them as-is.
      if (!dir || atomVec[0] !== 0 && atomVec[0] !== atomVec[1]) continue;
      const k = `${atomVec}|${c.path}|${dir}`;
      const e = perDir.get(k) ?? { atomVec, path: c.path, mr: 0, cr: 0, dir };
      if (c.mode !== 'capture') e.mr = Math.max(e.mr, c.range);
      if (c.mode !== 'move') e.cr = Math.max(e.cr, c.range);
      perDir.set(k, e);
    }
  }
  for (const e of perDir.values()) {
    const k = `${e.atomVec}|${e.path}|${e.mr}|${e.cr}`;
    const g = groups.get(k) ?? { atomVec: e.atomVec, path: e.path, mr: e.mr, cr: e.cr, dirs: [] };
    g.dirs.push(e.dir); groups.set(k, g);
  }
  const out: Component[] = [];
  const symOf = (g: { atomVec: [number, number]; dirs: Dir[] }): Component['sym'] => {
    const full = symmetryVariants(g.atomVec[0], g.atomVec[1]).length;
    return g.dirs.length === full ? 'all' : g.dirs;
  };
  for (const g of groups.values()) {
    const vec = g.atomVec;
    if (g.mr === g.cr) out.push({ vec, sym: symOf(g), range: g.mr, path: g.path, mode: 'both' });
    else {
      if (g.mr > 0) out.push({ vec, sym: symOf(g), range: g.mr, path: g.path, mode: 'move' });
      if (g.cr > 0) out.push({ vec, sym: symOf(g), range: g.cr, path: g.path, mode: 'capture' });
    }
  }
  // Oblique (N, C, Z) components pass through unchanged.
  for (const c of p.components) {
    const a = Math.abs(c.vec[0]); const b = Math.abs(c.vec[1]);
    if (Math.min(a, b) !== 0 && a !== b) out.push(c);
  }
  return out;
}

/** Betza for a piece, or null if it maps to a FSF built-in (vanilla pawn). */
export function pieceToBetza(p: Piece): string {
  if (p.id === VANILLA_PAWN_ID) return 'fmWfceFifmnD'; // documentation form; exported as built-in `pawn`
  return normalisedComponents(p).map(componentToBetza).join('');
}
