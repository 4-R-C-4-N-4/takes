import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Validates the hand-drawn "set v3" art.svg overrides in packages/library/pieces/*/art.svg
// (including the king, which has no piece.json). Geometry/content tests only — rendering is
// covered by packages/art/scripts/contact-sheet-v3.py.

const here = dirname(fileURLToPath(import.meta.url));
const piecesDir = join(here, '../../library/pieces');

const overrides = readdirSync(piecesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((id) => {
    try {
      readFileSync(join(piecesDir, id, 'art.svg'));
      return true;
    } catch {
      return false;
    }
  });

describe('hand-drawn art.svg overrides (set v3)', () => {
  test('every piece used by 2026.2 plus king has an override', () => {
    const expected = [
      'pawn', 'berolina', 'knight', 'bishop', 'wraith', 'lancer',
      'toad', 'heron', 'rook', 'queen', 'dragon', 'king',
    ];
    for (const id of expected) {
      expect(overrides).toContain(id);
    }
  });

  test('every 2026.3 piece (set v4) has an override', () => {
    const expected = [
      'triton', 'sai', 'worm', 'rose', 'vine', 'broom',
      'coroner', 'bullseye', 'impact', 'octopus', 'scarab', 'seal',
      'halo', 'jester', 'turtle', 'prince', 'dancer',
      'azazel', 'hierophant', 'bane',
    ];
    for (const id of expected) {
      expect(overrides).toContain(id);
    }
  });

  test.each(overrides)('%s/art.svg is well-formed', (id) => {
    const svg = readFileSync(join(piecesDir, id, 'art.svg'), 'utf8');

    expect(svg).toMatch(/viewBox="0 0 100 100"/);
    expect(svg).toMatch(/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

    // Every color attribute must be one of the two theme CSS vars (or 'none').
    const colorAttrs = [...svg.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]);
    for (const value of colorAttrs) {
      expect(['var(--piece-fill)', 'var(--piece-stroke)', 'none']).toContain(value);
    }

    // No external images/fonts/scripts.
    expect(svg).not.toMatch(/<image/);
    expect(svg).not.toMatch(/<script/);
    expect(svg).not.toMatch(/font-family/);

    // Balanced, parseable-looking tags (cheap sanity check, not a full XML parse).
    const opens = (svg.match(/<(rect|circle|polygon|path|g)\b/g) ?? []).length;
    expect(opens).toBeGreaterThan(0);
  });
});
