export * from './types.js';
export * from './enumerate.js';
export * from './canonicalize.js';
export * from './profile.js';
export * from './families.js';
export * from './generate.js';
export * from './verify.js';

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogEntry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', '..', '..', 'docs', 'catalog', 'catalog.json.gz');

/** Loads the built catalog (docs/catalog/catalog.json.gz) for downstream consumers (tools/scenarios). */
export function loadCatalog(path: string = DEFAULT_PATH): CatalogEntry[] {
  const buf = gunzipSync(readFileSync(path));
  const entries = JSON.parse(buf.toString('utf8')) as CatalogEntry[];
  // JSON has no Infinity: unbounded slide ranges are stored as null and MUST be restored, or the
  // Takes engine silently generates no slide moves while FSF (driven by the Betza string) does.
  for (const e of entries) for (const c of e.piece.components) if (c.range === null) c.range = Infinity;
  return entries;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic stratified sample: up to `perFamily` entries per family, seeded. */
export function stratifiedSample<T extends { families: string[] }>(entries: T[], perFamily: number, seed = 42): T[] {
  const rng = mulberry32(seed);
  const byFamily = new Map<string, T[]>();
  for (const e of entries) for (const f of e.families) {
    const list = byFamily.get(f) ?? [];
    list.push(e);
    byFamily.set(f, list);
  }
  const picked = new Set<T>();
  for (const list of byFamily.values()) {
    const shuffled = [...list].sort(() => rng() - 0.5);
    for (const item of shuffled.slice(0, perFamily)) picked.add(item);
  }
  return [...picked];
}
