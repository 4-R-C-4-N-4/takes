// Generate SVGs and raster jobs; run through contact-sheet.py.
import { mkdirSync, writeFileSync } from 'node:fs';
// Emit raster jobs for the Python runner (Node child processes may be sandboxed).
const jobs: Array<{ command: string; args: string[] }> = [];
function queueRaster(command: string, args: string[]) { jobs.push({ command, args }); }
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuleset } from '@takes/library';
import { pieceSvg, badgeSvg, KING_PIECE } from '../src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outDir = path.join(repoRoot, 'docs/art');
const jobFile = process.argv[2];
if (!jobFile) throw new Error('Run: python packages/art/scripts/contact-sheet.py');
const tmpDir = path.dirname(jobFile);

mkdirSync(outDir, { recursive: true });

mkdirSync(tmpDir, { recursive: true });

const ruleset = getRuleset('2026.2');
if (!ruleset) throw new Error('ruleset 2026.2 not found');
const pieces = [...Object.values(ruleset.pieces).sort((a, b) => a.id.localeCompare(b.id)), KING_PIECE];

const LIGHT = '#eceadc';
const DARK = '#7b8b6f';
const FILL_W = '#f4efe6';
const STROKE_W = '#1b1b1b';
const FILL_B = '#2b2b2b';
const STROKE_B = '#f4efe6';

const CELL = 110;
const PAD = 8;
const cols = pieces.length;
const rows = 4; // white piece, black piece, white badge, black badge

// Build one combined SVG document (docs/art/procedural-sheet.svg) with labels.
let svgBody = '';
pieces.forEach((p, col) => {
  const x = col * CELL;
  const label = `<text x="${x + CELL / 2}" y="${PAD + 10}" font-size="9" text-anchor="middle" font-family="sans-serif">${p.id}</text>`;
  svgBody += label;
  const cellsContent: Array<{ svg: string; fill: string; stroke: string; row: number }> = [
    { svg: pieceSvg(p), fill: FILL_W, stroke: STROKE_W, row: 0 },
    { svg: pieceSvg(p), fill: FILL_B, stroke: STROKE_B, row: 1 },
    { svg: badgeSvg(p), fill: FILL_W, stroke: STROKE_W, row: 2 },
    { svg: badgeSvg(p), fill: FILL_B, stroke: STROKE_B, row: 3 },
  ];
  for (const c of cellsContent) {
    const y = PAD + 14 + c.row * CELL;
    const inner = c.svg
      .replaceAll('var(--piece-fill)', c.fill)
      .replaceAll('var(--piece-stroke)', c.stroke)
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '');
    svgBody += `<g transform="translate(${x + PAD},${y}) scale(${(CELL - PAD * 2) / 100})">${inner}</g>`;
  }
});

const sheetW = cols * CELL;
const sheetH = PAD + 14 + rows * CELL;
const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}" viewBox="0 0 ${sheetW} ${sheetH}"><rect width="100%" height="100%" fill="white"/>${svgBody}</svg>`;
const sheetPath = path.join(outDir, 'procedural-sheet.svg');
writeFileSync(sheetPath, fullSvg);
console.log('wrote', sheetPath);

// Render a 40px PNG contact sheet: for each piece, white-on-light,
// white-on-dark, black-on-light, black-on-dark, for both piece art and badge.
const TILE = 40;
const variants: Array<{ name: string; fill: string; stroke: string; bg: string }> = [
  { name: 'w-light', fill: FILL_W, stroke: STROKE_W, bg: LIGHT },
  { name: 'w-dark', fill: FILL_W, stroke: STROKE_W, bg: DARK },
  { name: 'b-light', fill: FILL_B, stroke: STROKE_B, bg: LIGHT },
  { name: 'b-dark', fill: FILL_B, stroke: STROKE_B, bg: DARK },
];

function renderTile(svg: string, fill: string, stroke: string, bg: string, outPng: string) {
  // rsvg-convert 2.62 does not resolve CSS custom properties (var(...)), so
  // substitute literal colors for rasterization only; the saved library SVGs
  // keep the var() references for the app's CSS theming.
  const resolved = svg
    .replaceAll('var(--piece-fill)', fill)
    .replaceAll('var(--piece-stroke)', stroke);
  const bordered = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/>${resolved.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>`;
  const svgPath = outPng.replace(/\.png$/, '.svg');
  writeFileSync(svgPath, bordered);
  queueRaster('rsvg-convert', ['-w', String(TILE), '-h', String(TILE), svgPath, '-o', outPng]);
}

const tilePaths: string[][] = [];
for (const kind of ['piece', 'badge'] as const) {
  for (const variant of variants) {
    const rowPaths: string[] = [];
    for (const p of pieces) {
      const svg = kind === 'piece' ? pieceSvg(p) : badgeSvg(p);
      const tilePath = path.join(tmpDir, `${kind}-${variant.name}-${p.id}.png`);
      renderTile(svg, variant.fill, variant.stroke, variant.bg, tilePath);
      rowPaths.push(tilePath);
    }
    tilePaths.push(rowPaths);
  }
}

// Montage: columns = pieces, rows = kind x variant, at native 40px.
const allTiles = tilePaths.flat();
const montageOut = path.join(outDir, 'procedural-40.png');
queueRaster('magick', [
  'montage',
  ...allTiles,
  '-tile',
  `${pieces.length}x${tilePaths.length}`,
  '-geometry',
  `${TILE}x${TILE}+1+1`,
  '-background',
  '#888888',
  montageOut,
]);
console.log('wrote', montageOut, `(${pieces.length} pieces x ${tilePaths.length} rows: piece/badge x w-light/w-dark/b-light/b-dark)`);

// 64px pieces in all four color/square combinations.
const TILE64 = 64;
const row64: string[] = [];
for (const variant of variants) {
  for (const p of pieces) {
    const svg = pieceSvg(p);
    const tilePath = path.join(tmpDir, `p64-${variant.name}-${p.id}.png`);
    const resolved = svg.replaceAll('var(--piece-fill)', variant.fill).replaceAll('var(--piece-stroke)', variant.stroke);
    const bordered = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE64}" height="${TILE64}" viewBox="0 0 100 100"><rect width="100" height="100" fill="${variant.bg}"/>${resolved.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>`;
    const svgPath = tilePath.replace(/\.png$/, '.svg');
    writeFileSync(svgPath, bordered);
    queueRaster('rsvg-convert', ['-w', String(TILE64), '-h', String(TILE64), svgPath, '-o', tilePath]);
    row64.push(tilePath);
  }
}
const out64 = path.join(outDir, 'procedural-64.png');
queueRaster('magick', ['montage', ...row64, '-tile', `${pieces.length}x4`, '-geometry', `${TILE64}x${TILE64}+1+1`, '-background', '#888888', out64]);
console.log('wrote', out64);

// Labeled 40px white-on-light row with piece names underneath, for a quick
// "could a person tell these apart" visual check.
const LABEL_H = 14;
const labeledTiles: string[] = [];
for (const p of pieces) {
  const svg = pieceSvg(p);
  const resolved = svg.replaceAll('var(--piece-fill)', FILL_W).replaceAll('var(--piece-stroke)', STROKE_W);
  const inner = resolved.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const cellSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE + LABEL_H}">` +
    `<rect width="${TILE}" height="${TILE}" fill="${LIGHT}"/>` +
    `<g transform="scale(${TILE / 100})">${inner}</g>` +
    `<rect y="${TILE}" width="${TILE}" height="${LABEL_H}" fill="white"/>` +
    `<text x="${TILE / 2}" y="${TILE + LABEL_H - 3}" font-size="7" text-anchor="middle" font-family="sans-serif">${p.id}</text>` +
    `</svg>`;
  const svgPath = path.join(tmpDir, `labeled-${p.id}.svg`);
  const pngPath = path.join(tmpDir, `labeled-${p.id}.png`);
  writeFileSync(svgPath, cellSvg);
  queueRaster('rsvg-convert', ['-w', String(TILE), '-h', String(TILE + LABEL_H), svgPath, '-o', pngPath]);
  labeledTiles.push(pngPath);
}
const labeledOut = path.join(outDir, 'procedural-labeled.png');
queueRaster('magick', [
  'montage',
  ...labeledTiles,
  '-tile',
  `${pieces.length}x1`,
  '-geometry',
  `${TILE}x${TILE + LABEL_H}+1+1`,
  '-background',
  '#888888',
  labeledOut,
]);
console.log('wrote', labeledOut);



writeFileSync(jobFile, JSON.stringify(jobs));
