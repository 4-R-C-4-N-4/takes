/** Setup construction for calibration games and target-piece substitution experiments [spec "Valuation"]. */
import type { Ruleset } from '@takes/library';
import { serializeSetup, parseSetup, type Setup } from '@takes/library';

function emptyRanks(): Array<Array<string | null>> {
  return [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)];
}

/** A plain back-rank-and-pawns army, using only classic ids (pawn/knight/bishop/rook/queen/king). */
export function classicSetup(version: string): Setup {
  const ranks = emptyRanks();
  ranks[0] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  ranks[1] = Array(8).fill('pawn');
  return { version, ranks };
}

function clone(s: Setup): Setup {
  return { version: s.version, ranks: s.ranks.map((row) => row.slice()) };
}

/** Adds `count` copies of `id` to empty squares of the setup's third rank (back of the army, owner POV). */
export function addExtra(s: Setup, id: string, count: number): Setup {
  const out = clone(s);
  let placed = 0;
  for (let f = 0; f < 8 && placed < count; f++) {
    if (out.ranks[2]![f] === null) { out.ranks[2]![f] = id; placed++; }
  }
  if (placed < count) throw new Error('no room to add extra pieces');
  return out;
}

/** Removes one copy of `id` from the setup (first occurrence), leaving the square empty. */
export function removeOne(s: Setup, id: string): Setup {
  const out = clone(s);
  for (const row of out.ranks) {
    const i = row.indexOf(id);
    if (i >= 0) { row[i] = null; return out; }
  }
  throw new Error(`no '${id}' found to remove`);
}

/** Replaces the first occurrence of `fromId` with `toId`. */
export function substitute(s: Setup, fromId: string, toId: string): Setup {
  const out = clone(s);
  for (const row of out.ranks) {
    const i = row.indexOf(fromId);
    if (i >= 0) { row[i] = toId; return out; }
  }
  throw new Error(`no '${fromId}' found to substitute`);
}

export function str(s: Setup): string { return serializeSetup(s); }

export interface Pairing {
  /** Nominal material delta for white, in pawns (positive = white favored); used only for calibration x-axis / substitution bookkeeping. */
  deltaPawns: number;
  white: string;
  black: string;
  label: string;
}

/** Calibration pairings: White has a known nominal material edge over a classic Black army, spanning
 * -14..+9 pawns (color swaps extend to +14) (incl. a queen-down anchor) so inversion rarely needs to extrapolate [problem 3]. Both
 * orientations are produced by the caller via swap(); negative anchors remove material from White
 * instead of adding, to anchor the low end of the curve too. */
export function calibrationPairings(r: Ruleset): Pairing[] {
  const base = classicSetup(r.version);
  const mk = (label: string, deltaPawns: number, whiteSetup: Setup): Pairing => ({ label, deltaPawns, white: str(whiteSetup), black: str(base) });
  return [
    mk('-14 (queen+rook down)', -14, removeOne(removeOne(base, 'queen'), 'rook')),
    mk('-9 (queen down)', -9, removeOne(base, 'queen')),
    mk('-5 (rook down)', -5, removeOne(base, 'rook')),
    mk('-2 pawns', -2, removeOne(removeOne(base, 'pawn'), 'pawn')),
    mk('-1 pawn', -1, removeOne(base, 'pawn')),
    mk('+1 pawn', 1, addExtra(base, 'pawn', 1)),
    mk('+2 pawns', 2, addExtra(base, 'pawn', 2)),
    mk('+knight', 3, addExtra(base, 'knight', 1)),
    mk('+bishop', 3, addExtra(base, 'bishop', 1)),
    mk('+rook', 5, addExtra(base, 'rook', 1)),
    mk('+queen', 9, addExtra(base, 'queen', 1)),
  ];
}

/** Returns the color-swapped pairing (same opening, opposite colors) so each opening is played twice. */
export function swapColors(p: Pairing): Pairing {
  return { label: p.label + ' (swapped)', deltaPawns: -p.deltaPawns, white: p.black, black: p.white };
}

/**
 * Builds the substitution pairing used to value a target piece T relative to a reference piece
 * (knight by default, or bishop when T is itself the knight, giving a self-consistency control).
 * White gets T in place of one copy of the reference piece; Black keeps the reference piece.
 */
export function targetPairing(r: Ruleset, targetId: string): { pairing: Pairing; referenceId: string; referenceValuePawns: number } {
  const referenceId = targetId === 'knight' ? 'bishop' : 'knight';
  const referenceValuePawns = 3;
  const base = classicSetup(r.version);
  const white = substitute(base, referenceId, targetId);
  return { pairing: { label: `${targetId} vs ${referenceId}`, deltaPawns: NaN, white: str(white), black: str(base) }, referenceId, referenceValuePawns };
}

/** Same-tier substitution pairing [problem 2]: swaps `count` copies of `referenceId` for `targetId`
 * in White's army, keeping Black unchanged, so the comparison is per-unit against a same-tier slot
 * (e.g. rook-for-rook, or N vanilla pawns for N berolina pawns) rather than always a minor's slot. */
export function sameTierPairing(r: Ruleset, targetId: string, referenceId: string, referenceValuePawns: number, count = 1): { pairing: Pairing; referenceId: string; referenceValuePawns: number } {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
  const base = classicSetup(r.version);
  let white = clone(base);
  for (let i = 0; i < count; i++) white = substitute(white, referenceId, targetId);
  return { pairing: { label: `${count}x ${targetId} vs ${count}x ${referenceId} (same-tier slot)`, deltaPawns: NaN, white: str(white), black: str(base) }, referenceId, referenceValuePawns };
}

/** Exact substitution only: missing references are rejected, never replaced by an extra piece. */
export function randomTargetPairing(r: Ruleset, targetId: string, referenceId: string, randomSetupStr: string, count = 1): Pairing {
  const base = parseSetup(randomSetupStr);
  let white = base;
  for (let i = 0; i < count; i++) white = substitute(white, referenceId, targetId);
  return { label: `${count}x ${targetId} vs ${referenceId} (random profile)`, deltaPawns: NaN, white: str(white), black: str(base) };
}
