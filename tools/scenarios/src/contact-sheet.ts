#!/usr/bin/env node
/** Contact sheet generator [req. 5]: pieceSvg+badgeSvg per shortlisted candidate, rasterized with
 * rsvg-convert (literal colors substituted for var(--piece-fill)/var(--piece-stroke) since
 * rsvg-convert does not resolve CSS custom properties — see packages/art/scripts/contact-sheet.py
 * for the same pattern), tiled with ImageMagick `montage` into docs/catalog/shortlist.png. */
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pieceSvg, badgeSvg } from '@takes/art';
import type { ScreenedEntry } from '@takes/catalog';

const FILL = '#2b2f36';
const STROKE = '#e8e6df';

function literal(svg: string, fill = FILL, stroke = STROKE): string {
  return svg.replace(/var\(--piece-fill(?:,\s*([^)]+))?\)/g, (_m, fb) => fb ?? fill)
            .replace(/var\(--piece-stroke(?:,\s*([^)]+))?\)/g, (_m, fb) => fb ?? stroke);
}

export function buildContactSheet(entries: ScreenedEntry[], outPng: string, nullScore: Record<string, number> = {}): void {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'takes-contact-'));
  const tilePngs: string[] = [];
  for (const e of entries) {
    const svg = literal(pieceSvg(e.piece, { fillFallback: FILL, strokeFallback: STROKE }));
    // Badges draw marks in the stroke colour: use dark marks on the white tile so they are legible.
    const badge = literal(badgeSvg(e.piece), '#e9e3d3', '#1b1b1b');
    const svgPath = join(dir, `${e.piece.id}-piece.svg`);
    const badgePath = join(dir, `${e.piece.id}-badge.svg`);
    writeFileSync(svgPath, svg);
    writeFileSync(badgePath, badge);
    const piecePng = join(dir, `${e.piece.id}-piece.png`);
    const badgePng = join(dir, `${e.piece.id}-badge.png`);
    execFileSync('rsvg-convert', ['-w', '160', '-h', '160', '--background-color=white', svgPath, '-o', piecePng]);
    execFileSync('rsvg-convert', ['-w', '160', '-h', '160', '--background-color=white', badgePath, '-o', badgePng]);
    const tile = join(dir, `${e.piece.id}-tile.png`);
    const d = e.metrics.score - (nullScore[e.tier] ?? 0.5);
    const label = `${d >= 0 ? '+' : ''}${d.toFixed(2)} ${e.tier}\n${e.betza}`;
    execFileSync('montage', [piecePng, badgePng, '-tile', '2x1', '-geometry', '+4+4', '-title', label, '-pointsize', '12', tile]);
    tilePngs.push(tile);
  }
  if (tilePngs.length === 0) { writeFileSync(outPng, Buffer.alloc(0)); rmSync(dir, { recursive: true, force: true }); return; }
  execFileSync('montage', [...tilePngs, '-tile', '4x', '-geometry', '+8+8', '-background', 'white', outPng]);
  rmSync(dir, { recursive: true, force: true });
}

export function readShortlistJson(path: string): ScreenedEntry[] {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, ScreenedEntry[]>;
  const seen = new Map<string, ScreenedEntry>();
  for (const entries of Object.values(data)) for (const e of entries) {
    // JSON stores Infinity as null; restore it or art/badges draw unbounded sliders as steppers.
    for (const c of e.piece.components) if (c.range === null) c.range = Infinity;
    seen.set(e.piece.id, e);
  }
  return [...seen.values()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jsonPath = process.argv[2] ?? 'docs/catalog/shortlist.json';
  const outPng = process.argv[3] ?? 'docs/catalog/shortlist.png';
  let nulls: Record<string, number> = {};
  try { nulls = JSON.parse(readFileSync(jsonPath.replace(/shortlist\.json$/, 'null-controls.json'), 'utf8')); } catch { /* optional */ }
  const entries = readShortlistJson(jsonPath).sort((a, b) => (b.metrics.score - (nulls[b.tier] ?? 0.5)) - (a.metrics.score - (nulls[a.tier] ?? 0.5)));
  buildContactSheet(entries, outPng, nulls);
  console.log(`wrote ${outPng}`);
}
