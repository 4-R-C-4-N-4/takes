// Post-process a raw codex-generated PNG into a candidate piece SVG:
// grayscale threshold -> crop to bbox -> keep largest connected component(s)
// -> scale by the tier size table -> potrace -> inject CSS-var colors -> checks.
import type { Piece } from '@takes/library';
import type { Tier } from '@takes/art';
import { threshold, bbox, crop, connectedComponents, significantIslands, maskToIslands } from './image.js';
import { traceMaskToPathD, buildCandidateSvg } from './svg.js';
import { runChecks, type CandidateChecks } from './checks.js';

export interface PostProcessResult {
  svg: string;
  checks: CandidateChecks;
  islandWarning: string | null;
}

/** Read a PNG file into { width, height, data } RGBA via Jimp. */
export async function loadPngRGBA(pngPath: string): Promise<{ width: number; height: number; data: Uint8Array }> {
  const { default: Jimp } = await import('jimp');
  const img = await Jimp.read(pngPath);
  return { width: img.bitmap.width, height: img.bitmap.height, data: new Uint8Array(img.bitmap.data) };
}

export async function postProcess(piece: Piece, pngPath: string): Promise<PostProcessResult> {
  const raw = await loadPngRGBA(pngPath);
  const mask = threshold(raw, 140);
  const box = bbox(mask);
  if (!box) {
    throw new Error(`post-process ${piece.id}: thresholded image is blank`);
  }
  const cropped = crop(mask, box);

  const islands = connectedComponents(cropped);
  const { kept, dropped } = significantIslands(islands, 0.08);
  const islandWarning = kept.length > 1 ? `warning: ${kept.length} significant islands (image may be disconnected)` : null;

  const cleaned = maskToIslands(cropped, kept);
  const cleanedBox = bbox(cleaned) ?? { x0: 0, y0: 0, x1: cropped.width, y1: cropped.height };
  const finalMask = crop(cleaned, cleanedBox);

  const pathD = await traceMaskToPathD(finalMask);
  const svg = buildCandidateSvg({
    pathD,
    srcWidth: finalMask.width,
    srcHeight: finalMask.height,
    tier: piece.tier as Tier,
    name: piece.name,
  });

  const checks = runChecks(svg);
  return { svg, checks, islandWarning };
}
