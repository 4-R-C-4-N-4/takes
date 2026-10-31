// Search compound pieces for UNASSISTED mate power (super-major candidates).
import type { Piece, Component } from '@takes/library';
import { analyseMate } from '../src/mate.js';
import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
import { pieceToBetza } from '@takes/betza/pure';
import { mobilityOf } from './mobility-lib.js';

const slide = (vec: [number, number], range: number): Component => ({ vec, sym: 'all', range, path: 'slide', mode: 'both' });
const leap = (vec: [number, number]): Component => ({ vec, sym: 'all', range: 1, path: 'leap', mode: 'both' });
const LEAPS: Record<string, Component> = { N: leap([1, 2]), W: leap([1, 0]), F: leap([1, 1]), D: leap([2, 0]), A: leap([2, 2]) };
const BASES: Record<string, Component[]> = {
  Q: [slide([1, 0], Infinity), slide([1, 1], Infinity)],
  R: [slide([1, 0], Infinity)], B: [slide([1, 1], Infinity)],
  'R+B4': [slide([1, 0], Infinity), slide([1, 1], 4)], 'R+B3': [slide([1, 0], Infinity), slide([1, 1], 3)], 'R+B2': [slide([1, 0], Infinity), slide([1, 1], 2)],
  'B+R4': [slide([1, 1], Infinity), slide([1, 0], 4)], 'B+R3': [slide([1, 1], Infinity), slide([1, 0], 3)], 'B+R2': [slide([1, 1], Infinity), slide([1, 0], 2)],
  Q4: [slide([1, 0], 4), slide([1, 1], 4)], Q3: [slide([1, 0], 3), slide([1, 1], 3)],
  R4: [slide([1, 0], 4)], B4: [slide([1, 1], 4)], '': [],
};
const r = getRuleset(CURRENT_RULESET_VERSION)!;
const rows: Array<{ betza: string; win: number; longest: number; mob: number; assisted: number }> = [];
const names = Object.keys(LEAPS);
for (const [bn, base] of Object.entries(BASES)) {
  for (let mask = 0; mask < 1 << names.length; mask++) {
    const leaps = names.filter((_, i) => mask & (1 << i));
    if (!bn && leaps.length < 2) continue;
    // W/F leaps add nothing to a piece that already slides orthogonally/diagonally.
    if (leaps.includes('W') && base.some((c) => c.vec[0] === 1 && c.vec[1] === 0)) continue;
    if (leaps.includes('F') && base.some((c) => c.vec[0] === 1 && c.vec[1] === 1)) continue;
    const piece: Piece = { id: 'x', name: 'x', glyph: 'Z', tier: 'major', components: [...base, ...leaps.map((l) => LEAPS[l]!)] };
    const u = analyseMate(piece, false);
    if (u.winShare < 0.5) continue;
    rows.push({ betza: pieceToBetza(piece), win: u.winShare, longest: u.longestMate, mob: mobilityOf(piece), assisted: 0 });
  }
}
rows.sort((a, b) => a.mob - b.mob);
console.log(`| Betza | Alone: forced win | Longest mate alone | Busy-board mobility (25%) |`);
console.log(`| --- | --- | --- | --- |`);
for (const x of rows) console.log(`| ${x.betza} | ${(x.win * 100).toFixed(1)}% | ${x.longest} | ${x.mob.toFixed(1)} |`);
console.log(`\nReference busy mobility: Queen ${mobilityOf(r.pieces.queen!).toFixed(1)}, Bane ${mobilityOf(r.pieces.bane!).toFixed(1)}, Hierophant ${mobilityOf(r.pieces.hierophant!).toFixed(1)}, Coroner ${mobilityOf(r.pieces.coroner!).toFixed(1)}`);
