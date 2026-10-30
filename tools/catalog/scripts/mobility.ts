// Mobility vs cost for every non-pawn piece in the current ruleset (docs/PIECE-MOBILITY.md).
// Usage: pnpm --filter @takes/catalog mobility
// Counts destination squares; a square counts once if the piece can move OR capture there.
// 'busy' = random positions with 25% / 50% of the other squares occupied (sliders stop at the
// first piece, which they may capture; leaps ignore blockers). Seeded, so the output is stable.
import { CURRENT_RULESET_VERSION, expandPiece, getRuleset } from '@takes/library';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
import { pieceToBetza } from '@takes/betza/pure';

const r = getRuleset(CURRENT_RULESET_VERSION)!;
const CENTER = [27, 28, 35, 36]; // d4 e4 d5 e5

function reach(id: string, from: number, occ: (sq: number) => boolean): { all: number; orth: number; diag: number; leap: number } {
  const seen = new Set<number>(); let orth = 0, diag = 0, leap = 0;
  for (const v of expandPiece(r.pieces[id]!, 'w')) {
    if (v.cond === 'rank2') continue;
    const max = v.path === 'leap' ? 1 : Math.min(v.range, 7);
    for (let s = 1; s <= max; s++) {
      const f = (from % 8) + v.dx * s, rk = Math.floor(from / 8) + v.dy * s;
      if (f < 0 || f > 7 || rk < 0 || rk > 7) break;
      const sq = rk * 8 + f;
      if (!seen.has(sq)) {
        seen.add(sq);
        if (v.path === 'leap' && (Math.abs(v.dx) > 1 || Math.abs(v.dy) > 1)) leap++;
        else if (v.dx === 0 || v.dy === 0) orth++; else diag++;
      }
      if (v.path === 'slide' && occ(sq)) break; // sliders stop at the first piece (it can be captured)
    }
  }
  return { all: seen.size, orth, diag, leap };
}

// Seeded random blockers for a "busy board" estimate.
let seed = 12345; const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
function busy(id: string, density: number, trials = 4000): number {
  let total = 0;
  for (let t = 0; t < trials; t++) {
    const from = Math.floor(rand() * 64);
    const occupied = new Set<number>();
    for (let s = 0; s < 64; s++) if (s !== from && rand() < density) occupied.add(s);
    total += reach(id, from, (sq) => occupied.has(sq)).all;
  }
  return total / trials;
}

const screen = JSON.parse(readFileSync(join(repo, 'docs/catalog/fourway/screened.json'), 'utf8'));
const verdicts = JSON.parse(readFileSync(join(repo, 'docs/catalog/verdicts.json'), 'utf8'));
const strength: Record<string, number> = {};
for (const v of verdicts) {
  const c = screen.candidates.find((x: { key: string }) => x.key === v.key);
  if (c && v.name) strength[v.name.toLowerCase()] = c.metrics.score - screen.nullScore[c.tier];
}

const rows = Object.keys(r.pieces).filter((id) => r.pieces[id]!.tier !== 'pawn').map((id) => {
  const empty = () => false;
  const centre = CENTER.map((s) => reach(id, s, empty));
  const avg = (k: 'all' | 'orth' | 'diag' | 'leap') => centre.reduce((a, x) => a + x[k], 0) / centre.length;
  const board = [...Array(64).keys()].reduce((a, s) => a + reach(id, s, empty).all, 0) / 64;
  const corner = reach(id, 0, empty).all;
  return {
    id, name: r.pieces[id]!.name, betza: pieceToBetza(r.pieces[id]!), tier: r.pieces[id]!.tier, cost: r.costs[id]!,
    centre: avg('all'), orth: avg('orth'), diag: avg('diag'), leap: avg('leap'), board, corner,
    busy25: busy(id, 0.25), busy50: busy(id, 0.5), strength: strength[id],
  };
}).sort((a, b) => a.cost - b.cost || b.busy25 - a.busy25);

const f = (n: number | undefined, d = 1) => (n === undefined ? '' : n.toFixed(d));
const lines = rows.map((x) => `| ${x.betza} | ${x.name} | ${x.tier} | ${x.cost} | ${f(x.centre)} | ${f(x.orth)} / ${f(x.diag)} / ${f(x.leap)} | ${f(x.board)} | ${x.corner} | ${f(x.busy25)} | ${f(x.busy50)} | ${f(x.busy25 / x.cost, 2)} | ${x.strength === undefined ? '' : (x.strength >= 0 ? '+' : '') + x.strength.toFixed(2)} |`);
console.log('| Piece | Name | Tier | Cost | Centre | Orth / Diag / Leap | Whole board | Corner | Busy 25% | Busy 50% | Busy 25% per point | Screen strength |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
console.log(lines.join('\n'));
