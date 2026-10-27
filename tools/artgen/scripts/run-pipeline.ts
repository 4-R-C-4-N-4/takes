// Run the full artgen pipeline for every piece in getRuleset('2026.1'):
// codex image-gen -> post-process -> candidate SVG + checks. Writes
// packages/library/pieces/{id}/art.candidate.svg, docs/art/candidates-40.png
// contact sheet and docs/art/candidates-report.md.
//
// Usage: node --experimental-strip-types --experimental-loader
//   packages/art/scripts/ts-esm-loader.mjs tools/artgen/scripts/run-pipeline.ts [--ids=a,b,c] [--max-retries=2]
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getRuleset } from '@takes/library';
import { buildPrompt } from '../src/prompt.js';
import { generatePieceImage } from '../src/codex.js';
import { postProcess } from '../src/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const argv = process.argv.slice(2);
const idsArg = argv.find((a) => a.startsWith('--ids='));
const maxRetriesArg = argv.find((a) => a.startsWith('--max-retries='));
const maxRetries = maxRetriesArg ? Number(maxRetriesArg.split('=')[1]) : 2;

const ruleset = getRuleset('2026.1');
if (!ruleset) throw new Error('ruleset 2026.1 not found');
let pieces = Object.values(ruleset.pieces).sort((a, b) => a.id.localeCompare(b.id));
if (idsArg) {
  const ids = new Set(idsArg.split('=')[1]!.split(','));
  pieces = pieces.filter((p) => ids.has(p.id));
}

interface PieceReport {
  id: string;
  prompt: string;
  attempts: number;
  pass: boolean;
  checks: { name: string; pass: boolean; detail: string }[];
  islandWarning: string | null;
  svgPath: string;
}

const reports: PieceReport[] = [];
let codexCalls = 0;

for (const piece of pieces) {
  const prompt = buildPrompt(piece);
  let attempt = 1;
  let lastResult: Awaited<ReturnType<typeof postProcess>> | null = null;
  let lastErr: string | null = null;

  for (; attempt <= maxRetries + 1; attempt++) {
    console.log(`\n=== ${piece.id} attempt ${attempt} ===`);
    let pngPath: string;
    try {
      const gen = await generatePieceImage({ repoRoot, id: piece.id, attempt, prompt });
      if (!gen.fromCache) codexCalls++;
      pngPath = gen.pngPath;
      console.log(`  image: ${pngPath} (${gen.fromCache ? 'cached' : 'new call'}, calls so far: ${codexCalls})`);
    } catch (e) {
      lastErr = String(e);
      console.error(`  codex call failed: ${lastErr}`);
      continue;
    }

    try {
      lastResult = await postProcess(piece, pngPath);
      console.log(`  checks: ${lastResult.checks.results.map((r) => `${r.name}=${r.pass ? 'PASS' : 'FAIL'}`).join(', ')}`);
      if (lastResult.islandWarning) console.log(`  ${lastResult.islandWarning}`);
      if (lastResult.checks.allPass) break;
    } catch (e) {
      lastErr = String(e);
      console.error(`  post-process failed: ${lastErr}`);
    }
  }

  if (!lastResult) {
    reports.push({ id: piece.id, prompt, attempts: attempt - 1, pass: false, checks: [{ name: 'generation', pass: false, detail: lastErr ?? 'unknown failure' }], islandWarning: null, svgPath: '' });
    continue;
  }

  const pieceDir = path.join(repoRoot, 'packages/library/pieces', piece.id);
  mkdirSync(pieceDir, { recursive: true });
  const svgPath = path.join(pieceDir, 'art.candidate.svg');
  writeFileSync(svgPath, lastResult.svg);

  reports.push({
    id: piece.id,
    prompt,
    attempts: attempt - 1,
    pass: lastResult.checks.allPass,
    checks: lastResult.checks.results,
    islandWarning: lastResult.islandWarning,
    svgPath: path.relative(repoRoot, svgPath),
  });
}

// --- Contact sheet (candidates-40.png) ---
const outDir = path.join(repoRoot, 'docs/art');
mkdirSync(outDir, { recursive: true });
const tmpDir = path.join(repoRoot, '.artgen-contact-sheet-tmp');
mkdirSync(tmpDir, { recursive: true });

const TILE = 40;
const LIGHT = '#eceadc';
const DARK = '#7b8b6f';
const FILL_W = '#f4efe6';
const STROKE_W = '#1b1b1b';
const FILL_B = '#2b2b2b';
const STROKE_B = '#f4efe6';
const variants = [
  { name: 'w-light', fill: FILL_W, stroke: STROKE_W, bg: LIGHT },
  { name: 'w-dark', fill: FILL_W, stroke: STROKE_W, bg: DARK },
  { name: 'b-light', fill: FILL_B, stroke: STROKE_B, bg: LIGHT },
  { name: 'b-dark', fill: FILL_B, stroke: STROKE_B, bg: DARK },
];

function renderTile(svg: string, fill: string, stroke: string, bg: string, outPng: string) {
  const resolved = svg.replaceAll('var(--piece-fill)', fill).replaceAll('var(--piece-stroke)', stroke);
  const bordered = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/>${resolved.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>`;
  const svgPath = outPng.replace(/\.png$/, '.svg');
  writeFileSync(svgPath, bordered);
  execFileSync('rsvg-convert', ['-w', String(TILE), '-h', String(TILE), svgPath, '-o', outPng]);
}

const haveSvg = reports.filter((r) => r.svgPath);
const tilePaths: string[][] = [];
for (const variant of variants) {
  const rowPaths: string[] = [];
  for (const r of haveSvg) {
    const svgContent = readFileSync(path.join(repoRoot, r.svgPath), 'utf8');
    const tilePath = path.join(tmpDir, `${variant.name}-${r.id}.png`);
    renderTile(svgContent, variant.fill, variant.stroke, variant.bg, tilePath);
    rowPaths.push(tilePath);
  }
  tilePaths.push(rowPaths);
}

if (haveSvg.length > 0) {
  const montageOut = path.join(outDir, 'candidates-40.png');
  execFileSync('magick', [
    'montage',
    ...tilePaths.flat(),
    '-tile',
    `${haveSvg.length}x${tilePaths.length}`,
    '-geometry',
    `${TILE}x${TILE}+1+1`,
    '-background',
    '#888888',
    montageOut,
  ]);
  console.log(`\nwrote ${montageOut}`);
}

// --- Report (candidates-report.md) ---
let md = `# Codex candidate art — checks report\n\n`;
md += `Pieces attempted: ${reports.length}. Codex calls used: ${codexCalls}.\n\n`;
for (const r of reports) {
  md += `## ${r.id}\n\n`;
  md += `- Pass: ${r.pass ? '✅' : '❌'}\n`;
  md += `- Attempts: ${r.attempts}\n`;
  md += `- SVG: \`${r.svgPath || 'none'}\`\n`;
  if (r.islandWarning) md += `- ${r.islandWarning}\n`;
  md += `- Prompt: ${r.prompt}\n`;
  md += `- Checks:\n`;
  for (const c of r.checks) md += `  - ${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}\n`;
  md += `\n`;
}
const reportPath = path.join(outDir, 'candidates-report.md');
writeFileSync(reportPath, md);
console.log(`wrote ${reportPath}`);

console.log(`\nTotal codex calls used: ${codexCalls}`);
