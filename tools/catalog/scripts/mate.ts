// Lone-king mate report for the current roster (docs/SUPERMAJOR.md).
// Usage: pnpm --filter @takes/catalog mate [--catalog]
//   --catalog also screens every four-way-symmetric catalog piece for UNASSISTED mate.
import { CURRENT_RULESET_VERSION, getRuleset, type Piece } from '@takes/library';
import { pieceToBetza } from '@takes/betza/pure';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseMate } from '../src/mate.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const r = getRuleset(CURRENT_RULESET_VERSION)!;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

console.log('| Piece | Name | Tier | Cost | With its king: forced win | Longest mate | Alone: forced win | Alone, king in corner | Alone: any mate exists |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const id of Object.keys(r.pieces)) {
  const p = r.pieces[id]!;
  if (p.tier === 'pawn') continue;
  const a = analyseMate(p, true), u = analyseMate(p, false);
  console.log(`| ${pieceToBetza(p)} | ${p.name} | ${p.tier} | ${r.costs[id]} | ${pct(a.winShare)} | ${a.winShare ? a.longestMate : '–'} | ${pct(u.winShare)} | ${pct(u.cornerWinShare)} | ${u.mateExists ? 'yes' : 'no'} |`);
}

if (process.argv.includes('--catalog')) {
  type Entry = { key: string; betza: string; tier: string; piece: Piece };
  const raw = JSON.parse(gunzipSync(readFileSync(join(repo, 'docs/catalog/catalog.json.gz'))).toString()) as Entry[];
  const fourway = raw.filter((e) => {
    const items = new Set(e.key.split(';'));
    const mirror = (it: string, i: number) => { const p = it.split(','); p[i] = String(-Number(p[i]) + 0); return p.join(','); };
    return [...items].every((it) => items.has(mirror(it, 0)) && items.has(mirror(it, 1)));
  });
  for (const e of fourway) for (const c of e.piece.components) if ((c.range as number | null) === null) c.range = Infinity;
  const hits: Array<{ betza: string; tier: string; win: number; longest: number; sameMoves: boolean }> = [];
  for (const e of fourway) {
    if (e.tier === 'pawn') continue;
    const u = analyseMate(e.piece, false);
    if (u.winShare > 0) hits.push({ betza: e.betza, tier: e.tier, win: u.winShare, longest: u.longestMate, sameMoves: !/(^|[^a-z])[mc]/.test(e.betza) });
  }
  hits.sort((a, b) => b.win - a.win);
  console.log(`\nFour-way-symmetric catalog pieces screened: ${fourway.length}; can force mate ALONE from some positions: ${hits.length}`);
  console.log('| Betza | Tier | Alone: forced win | Longest mate | Same moves & attacks |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const h of hits) console.log(`| ${h.betza} | ${h.tier} | ${pct(h.win)} | ${h.longest} | ${h.sameMoves ? 'yes' : 'no'} |`);
}
