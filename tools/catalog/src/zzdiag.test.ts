import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateCombos, canonicaliseAndDedupe, filterValid } from './build.js';
import { exhaustiveCases, verifyBatch } from './verify.js';

it('diagnose mismatches', () => {
  const { combos } = generateCombos(0);
  const valid = filterValid(canonicaliseAndDedupe(combos), 17).entries.slice(0, 3000);
  const res = verifyBatch(valid.flatMap((e) => exhaustiveCases(e.piece, e.betza)));
  const bad = new Map<string, typeof res>();
  for (const r of res) if (!r.ok) { const a = bad.get(r.id) ?? []; a.push(r); bad.set(r.id, a); }
  const lines: string[] = [`pieces=${valid.length} badPieces=${bad.size}`];
  const byId = new Map(valid.map((e) => [e.piece.id, e]));
  for (const [id, rs] of [...bad].slice(0, 25)) {
    const e = byId.get(id)!;
    const r = rs[0]!;
    const missing = r.want!.filter((m) => !r.got!.includes(m)); const extra = r.got!.filter((m) => !r.want!.includes(m));
    lines.push(`${e.betza} n=${rs.length} missing=${missing.slice(0, 6)} extra=${extra.slice(0, 6)} ${r.error ?? ''} comps=${JSON.stringify(e.piece.components)}`);
  }
  writeFileSync(process.env.TMPDIR + '/diag.txt', lines.join('\n'));
}, 600000);
