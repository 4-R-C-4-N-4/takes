import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { buildPrompt, STYLE_SUFFIX } from '../src/prompt.js';
import {
  threshold,
  bbox,
  crop,
  connectedComponents,
  significantIslands,
  maskToIslands,
  type BinaryMask,
} from '../src/image.js';
import { buildCandidateSvg } from '../src/svg.js';

const ruleset = getRuleset('2026.1')!;

describe('buildPrompt', () => {
  it('includes the piece tier, motif description and the fixed style text', () => {
    const rook = ruleset.pieces.rook;
    const prompt = buildPrompt(rook);
    expect(prompt).toContain('rook');
    expect(prompt).toContain('square, crenellated');
    expect(prompt).toContain(STYLE_SUFFIX);
  });

  it('mentions a crest for the wraith (capture != move) but not the rook', () => {
    const wraith = ruleset.pieces.wraith;
    const rook = ruleset.pieces.rook;
    expect(buildPrompt(wraith)).toContain('crest');
    expect(buildPrompt(rook)).not.toContain('crest');
  });

  it('is deterministic', () => {
    for (const p of Object.values(ruleset.pieces)) {
      expect(buildPrompt(p)).toBe(buildPrompt(p));
    }
  });
});

function maskFromAscii(rows: string[]): BinaryMask {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) data[y * width + x] = row[x] === '#' ? 1 : 0;
  });
  return { width, height, data };
}

describe('threshold', () => {
  it('marks dark opaque pixels as ink and light/transparent pixels as background', () => {
    // 2x1 image: one black opaque pixel, one white opaque pixel.
    const data = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
    const mask = threshold({ width: 2, height: 1, data }, 128);
    expect(Array.from(mask.data)).toEqual([1, 0]);
  });
});

describe('bbox + crop', () => {
  it('finds the tight bounding box of ink pixels and crops to it', () => {
    const mask = maskFromAscii(['.....', '..#..', '.###.', '.....']);
    const box = bbox(mask);
    expect(box).toEqual({ x0: 1, y0: 1, x1: 4, y1: 3 });
    const cropped = crop(mask, box!);
    expect(cropped.width).toBe(3);
    expect(cropped.height).toBe(2);
  });

  it('returns null for an empty mask', () => {
    const mask = maskFromAscii(['...', '...']);
    expect(bbox(mask)).toBeNull();
  });
});

describe('connectedComponents + significantIslands', () => {
  it('finds two disconnected islands and sorts largest first', () => {
    const mask = maskFromAscii(['##...##', '##.....', '.......']);
    const islands = connectedComponents(mask);
    expect(islands.length).toBe(2);
    expect(islands[0]!.size).toBeGreaterThanOrEqual(islands[1]!.size);
  });

  it('drops small specks relative to the largest island', () => {
    const mask = maskFromAscii(['#####.......', '#####.......', '#####......#']);
    const islands = connectedComponents(mask);
    const { kept, dropped } = significantIslands(islands, 0.08);
    expect(kept.length).toBe(1);
    expect(dropped).toBe(1);
  });

  it('maskToIslands keeps only the chosen islands pixels', () => {
    const mask = maskFromAscii(['##...##', '##.....', '.......']);
    const islands = connectedComponents(mask);
    const cleaned = maskToIslands(mask, [islands[0]!]);
    const totalInk = Array.from(cleaned.data).reduce((a, b) => a + b, 0);
    expect(totalInk).toBe(islands[0]!.size);
  });
});

describe('buildCandidateSvg', () => {
  it('produces a valid single-path SVG scaled onto the 100x100 canvas with CSS vars', () => {
    const svg = buildCandidateSvg({ pathD: 'M0 0 L10 0 L10 10 L0 10 Z', srcWidth: 10, srcHeight: 10, tier: 'minor', name: 'Test' });
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('var(--piece-fill)');
    expect(svg).toContain('var(--piece-stroke)');
    expect((svg.match(/<path/g) || []).length).toBe(1);
  });
});
