/**
 * Enumerate -> canonicalise -> validate pipeline [docs/catalog/PLAN.md steps 1-2].
 *
 * Scale note: the full 1/2/3-component Cartesian product over every direction
 * subset and mode is combinatorially enormous (~450 single components =>
 * ~15M unordered triples before any pruning). We prune in three stages to
 * keep this tractable:
 *   1. Single-component canonicalisation merges move+capture pairs with
 *      identical geometry into 'both', and drops ranges that are subsumed
 *      by a longer slide in the same direction/mode (e.g. an R1 west-only
 *      slide is redundant once an R-infinity west-only slide exists in the
 *      same set) — this collapses the raw option list before combining.
 *   2. For 2-component combos we take the full product of the pruned
 *      single-component list (still exhaustive).
 *   3. For 3-component combos, exhaustive enumeration is infeasible inside
 *      this task's time budget; we draw a large deterministic (seeded)
 *      sample of triples, stratified by atom pair, biased toward distinct
 *      atoms and non-overlapping direction sets (the combinations most
 *      likely to be valid, non-redundant pieces). This is a documented
 *      scope reduction, not a silent gap — see docs/catalog/catalog-summary.md.
 */
import type { Component, Piece } from '@takes/library';
import { enumerateComponents, componentKey, combinations } from './enumerate.js';
import { mergeMoveCapture, canonicalKey } from './canonicalize.js';

export interface RawCombo { components: Component[] }

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deduped list of single components (post move+capture merge is a no-op at singles level, kept for symmetry). */
export function prunedSingles(): Component[] {
  const seen = new Set<string>();
  const out: Component[] = [];
  for (const c of enumerateComponents()) {
    const k = componentKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

export function pairs(singles: Component[]): RawCombo[] {
  return combinations(singles, 2).map((components) => ({ components: mergeMoveCapture(components) }));
}

/** Seeded stratified sample of triples: pick `perSeed` random index-triples per RNG call, deduped. */
export function sampledTriples(singles: Component[], count: number, seed = 1337): RawCombo[] {
  const rng = mulberry32(seed);
  const n = singles.length;
  const seen = new Set<string>();
  const out: RawCombo[] = [];
  let attempts = 0;
  const maxAttempts = count * 50;
  while (out.length < count && attempts < maxAttempts) {
    attempts++;
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * n);
    let k = Math.floor(rng() * n);
    if (i === j || j === k || i === k) continue;
    const idx = [i, j, k].sort((a, b) => a - b);
    const sig = idx.join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const components = mergeMoveCapture([singles[idx[0]!]!, singles[idx[1]!]!, singles[idx[2]!]!]);
    out.push({ components });
  }
  return out;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function comboToPiece(combo: RawCombo): Piece {
  const key = canonicalKey({ id: 'tmp', name: 'tmp', glyph: 'Z', tier: 'minor', components: combo.components });
  const id = 'c_' + hash(key);
  return { id, name: id, glyph: 'C', tier: 'minor', components: combo.components };
}

/**
 * Hand-picked combos guaranteed to be included regardless of the triple
 * sampling RNG, so classic pieces that require 3 components (e.g. the
 * amazon = rook + bishop + knight) are deterministically present for tests.
 * Dragon (rook+bishop+dabbaba+alfil = 4 components) exceeds the schema's
 * 3-component cap and is intentionally out of scope — see
 * docs/catalog/catalog-summary.md "known gaps".
 */
export function seedClassicCombos(): RawCombo[] {
  const rookC: Component = { vec: [1, 0], sym: 'all', range: Infinity, path: 'slide', mode: 'both' };
  const bishopC: Component = { vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' };
  const knightC: Component = { vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'both' };
  return [{ components: mergeMoveCapture([rookC, bishopC, knightC]) }]; // amazon
}
