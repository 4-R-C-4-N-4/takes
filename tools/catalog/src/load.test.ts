import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { expandPiece } from '@takes/library';
import { loadCatalog } from './index.js';

it.skipIf(!existsSync(new URL('../../../docs/catalog/catalog.json.gz', import.meta.url)))('restores unbounded slide ranges (JSON null -> Infinity)', () => {
  const entries = loadCatalog();
  const rook = entries.find((e) => e.betza === 'R');
  expect(rook).toBeDefined();
  expect(rook!.piece.components.every((c) => c.range === Infinity)).toBe(true);
  expect(expandPiece(rook!.piece, 'w').every((v) => v.range === Infinity)).toBe(true);
  expect(entries.some((e) => e.piece.components.some((c) => c.range === null))).toBe(false);
});
