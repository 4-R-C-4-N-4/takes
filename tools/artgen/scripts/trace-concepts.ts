// Trace Codex concept crops (from packages/art/scripts/split_sheet.py) into art.svg overrides that
// share the hand-drawn set's plinth, baseline and tier sizing.
// Usage: pnpm --filter @takes/artgen exec tsx scripts/trace-concepts.ts <cropDir> <id> [<id> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import potraceLib from 'potrace';
import { getRuleset } from '@takes/library';

const potrace = potraceLib as unknown as {
  trace(file: string, opts: Record<string, unknown>, cb: (err: Error | null, svg: string) => void): void;
};
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const r = getRuleset('2026.3')!;

// Plinths match the classics (pawn 42, bishop/knight 48, rook 58, queen 54 wide; y 86..92).
// Box = the figure's allowed area above the plinth: top edge and max width per tier.
const TIER = {
  pawn: { plinth: 42, top: 30, maxW: 52 },
  minor: { plinth: 48, top: 17, maxW: 66 },
  rook: { plinth: 58, top: 15, maxW: 74 },
  major: { plinth: 54, top: 8, maxW: 76 },
} as const;
const BASE = 86;
const STROKE = 3;

function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const trace = (file: string) => new Promise<string>((res, rej) =>
  potrace.trace(file, { turdSize: 40, optTolerance: 0.6, alphaMax: 1.1, threshold: 128 }, (e, svg) => {
    if (e) return rej(e);
    const m = svg.match(/ d="([^"]+)"/);
    return m ? res(m[1]!) : rej(new Error(`no path for ${file}`));
  }));
const f = (n: number) => String(Math.round(n * 1000) / 1000);

const [cropDir, ...ids] = process.argv.slice(2);
for (const id of ids) {
  // The king is engine-fixed and not listed in rulesets; draw it at major-tier size.
  const piece = id === 'king' ? { name: 'King', tier: 'major' as const } : r.pieces[id];
  if (!piece) throw new Error(`${id} is not in ruleset 2026.3`);
  const t = TIER[piece.tier];
  const file = join(cropDir!, `${id}.png`);
  const { w, h } = pngSize(file);
  const d = await trace(file);
  // Crops carry an 8px blank pad on every side (split_sheet.py); fit the inked box, not the pad.
  const pad = 8, iw = w - 2 * pad, ih = h - 2 * pad;
  const s = Math.min((BASE - t.top) / ih, t.maxW / iw);
  const tx = 50 - (iw * s) / 2 - pad * s;
  const ty = BASE + 1 - ih * s - pad * s; // overlap the plinth by 1 so the outlines merge
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${piece.name}">`,
    `  <path transform="translate(${f(tx)},${f(ty)}) scale(${f(s)})" d="${d}" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="${f(STROKE / s)}" stroke-linejoin="round" fill-rule="evenodd"/>`,
    `  <rect x="${f(50 - t.plinth / 2)}" y="86" width="${t.plinth}" height="6" rx="2" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="4" stroke-linejoin="round"/>`,
    `</svg>`,
    '',
  ].join('\n');
  writeFileSync(join(root, 'packages/library/pieces', id, 'art.svg'), svg);
  console.log(id, piece.tier, `scale ${f(s)}`, `${svg.length} bytes`);
}
