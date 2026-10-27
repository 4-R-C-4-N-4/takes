// SVG post-processing: potrace a cleaned raster mask, then scale the traced
// path onto the shared 100x100 tier baseline box (matching packages/art's
// TIER_SIZE table), and inject CSS-var fill/stroke so one file serves both colors.
import potraceLib from 'potrace';
import { TIER_SIZE, BASELINE_Y, type Tier } from '@takes/art';
import type { BinaryMask } from './image.js';

const { Potrace } = potraceLib as unknown as {
  Potrace: new (opts?: Record<string, unknown>) => {
    loadImage(src: unknown, cb: (err: Error | null) => void): void;
    getSVG(): string;
    getPathTag(fillColor?: string): string;
  };
};

/** Trace a binary mask (0/1 per pixel) to an SVG path 'd' string via potrace. */
export async function traceMaskToPathD(mask: BinaryMask): Promise<string> {
  // potrace wants a Jimp-compatible bitmap; build one from the mask (black ink
  // on white background) using Jimp directly to avoid depending on potrace's
  // private image-loading internals.
  const { default: Jimp } = await import('jimp');
  const img = new Jimp(mask.width, mask.height, 0xffffffff);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const ink = mask.data[y * mask.width + x];
      img.setPixelColor(ink ? 0x000000ff : 0xffffffff, x, y);
    }
  }
  const buffer = await img.getBufferAsync(Jimp.MIME_PNG);

  return new Promise((resolve, reject) => {
    const tracer = new Potrace({ turdSize: 20, optTolerance: 0.4, threshold: 128, blackOnWhite: true });
    tracer.loadImage(buffer, (err) => {
      if (err) return reject(err);
      const svg = tracer.getSVG();
      const m = svg.match(/ d="([^"]+)"/);
      if (!m) return reject(new Error('potrace produced no path data'));
      resolve(m[1]!);
    });
  });
}

/**
 * Scale a traced path (in its own bitmap pixel space, origin top-left) onto
 * the shared 100x100 canvas using the per-tier size table on the common
 * baseline, matching packages/art's TIER_SIZE/BASELINE_Y (never fit-to-box).
 */
export function buildCandidateSvg(opts: {
  pathD: string;
  srcWidth: number;
  srcHeight: number;
  tier: Tier;
  name: string;
}): string {
  const { pathD, srcWidth, srcHeight, tier, name } = opts;
  const size = TIER_SIZE[tier];
  // Scale so the traced silhouette's height matches the tier's target height.
  const scale = size.height / srcHeight;
  const scaledWidth = srcWidth * scale;
  // Center horizontally, sit the bottom on BASELINE_Y.
  const tx = 50 - scaledWidth / 2;
  const ty = BASELINE_Y - size.height;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${escapeXml(name)}">` +
    `<g transform="translate(${fmt(tx)},${fmt(ty)}) scale(${fmt(scale)})">` +
    `<path d="${pathD}" fill="var(--piece-fill)" stroke="var(--piece-stroke)" ` +
    `stroke-width="${fmt(3 / scale)}" stroke-linejoin="round" fill-rule="evenodd"/>` +
    `</g></svg>`
  );
}

function fmt(n: number): string {
  return Math.round(n * 10000) / 10000 + '';
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
