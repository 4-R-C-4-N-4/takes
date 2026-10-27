// Automated QA checks for a candidate SVG, per docs/plan-review.md section C:
// path count, island count, min feature width at 40px raster, both colors render.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { threshold, bbox, connectedComponents, significantIslands } from './image.js';

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface CandidateChecks {
  results: CheckResult[];
  allPass: boolean;
}

function readPngRGBA(pngPath: string): { width: number; height: number; data: Uint8Array } {
  // Use ImageMagick to dump raw RGBA so we don't need another PNG decoder dep.
  const raw = execFileSync('magick', [pngPath, 'RGBA:-']);
  const dims = execFileSync('magick', ['identify', '-format', '%w %h', pngPath]).toString().trim();
  const [w, h] = dims.split(' ').map(Number);
  return { width: w!, height: h!, data: new Uint8Array(raw) };
}

/** Rasterize an SVG (with CSS vars resolved to literal colors) at a given pixel size. */
function rasterize(svg: string, fill: string, stroke: string, px: number): string {
  const resolved = svg.replaceAll('var(--piece-fill)', fill).replaceAll('var(--piece-stroke)', stroke);
  const withBg = resolved.replace('<svg ', `<svg style="background:#fff" `);
  const tmp = path.join(os.tmpdir(), `artgen-check-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const svgPath = tmp + '.svg';
  const pngPath = tmp + '.png';
  writeFileSync(svgPath, `<?xml version="1.0"?>${withBg}`);
  execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '-b', 'white', svgPath, '-o', pngPath]);
  unlinkSync(svgPath);
  return pngPath;
}

/** Run all checks on a candidate SVG string. */
export function runChecks(svg: string): CandidateChecks {
  const results: CheckResult[] = [];

  // 1. Path count: exactly one <path>.
  const pathCount = (svg.match(/<path[\s/>]/g) || []).length;
  results.push({ name: 'single-path', pass: pathCount === 1, detail: `${pathCount} <path> element(s)` });

  // 2. Both colors render without error.
  let bothColorsOk = true;
  let colorDetail = 'ok';
  let whitePng = '';
  try {
    whitePng = rasterize(svg, '#f4efe6', '#1b1b1b', 160);
    const blackPng = rasterize(svg, '#2b2b2b', '#f4efe6', 160);
    unlinkSync(blackPng);
  } catch (e) {
    bothColorsOk = false;
    colorDetail = String(e);
  }
  results.push({ name: 'both-colors-render', pass: bothColorsOk, detail: colorDetail });

  // 3. Island count + min feature width, measured on a 40px raster.
  if (bothColorsOk) {
    try {
      const png40 = rasterize(svg, '#000000', '#000000', 40);
      const img = readPngRGBA(png40);
      unlinkSync(png40);
      const mask = threshold({ width: img.width, height: img.height, data: img.data }, 200);
      const box = bbox(mask);
      const islands = connectedComponents(mask);
      const { kept, dropped } = significantIslands(islands, 0.08);
      results.push({
        name: 'single-island-at-40px',
        pass: kept.length === 1,
        detail: `${kept.length} significant island(s) (${islands.length} raw, ${dropped} dropped as specks)`,
      });

      // Min feature width: approximate via erosion-like check — for every ink
      // pixel, verify it has ink neighbors within a 1px ring on at least one
      // axis-aligned direction pair, i.e. the ink isn't a single-pixel sliver.
      // A simpler, robust proxy: minimum run-length of consecutive ink pixels
      // in any row or column within the bbox, as a fraction of image height.
      let minRun = Infinity;
      if (box) {
        for (let y = box.y0; y < box.y1; y++) {
          let run = 0;
          for (let x = box.x0; x < box.x1; x++) {
            if (mask.data[y * mask.width + x]) {
              run++;
            } else {
              if (run > 0) minRun = Math.min(minRun, run);
              run = 0;
            }
          }
          if (run > 0) minRun = Math.min(minRun, run);
        }
      }
      const heightPx = box ? box.y1 - box.y0 : img.height;
      const minFeatureFraction = box ? minRun / heightPx : 0;
      results.push({
        name: 'min-feature-width-40px',
        pass: Number.isFinite(minRun) && minFeatureFraction >= 0.05,
        detail: `min horizontal run ${Number.isFinite(minRun) ? minRun : 'n/a'}px (${(minFeatureFraction * 100).toFixed(1)}% of height)`,
      });
    } catch (e) {
      results.push({ name: 'single-island-at-40px', pass: false, detail: String(e) });
      results.push({ name: 'min-feature-width-40px', pass: false, detail: String(e) });
    }
  } else {
    results.push({ name: 'single-island-at-40px', pass: false, detail: 'skipped: render failed' });
    results.push({ name: 'min-feature-width-40px', pass: false, detail: 'skipped: render failed' });
  }

  const allPass = results.every((r) => r.pass);
  return { results, allPass };
}
