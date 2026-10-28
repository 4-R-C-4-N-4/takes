#!/usr/bin/env node
/** Deterministic catalog build CLI [docs/catalog/PLAN.md steps 1-6]. `pnpm --filter @takes/catalog run build`. */
import { gzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Piece, Vector } from '@takes/library';
import { getRuleset, expandPiece } from '@takes/library';
import { validatePiece, hasErrors } from '@takes/validator';
import { pieceToBetza, BetzaUnsupported } from '@takes/betza';
import { prunedSingles, pairs, sampledTriples, comboToPiece, seedClassicCombos, type RawCombo } from './generate.js';
import { canonicalKey } from './canonicalize.js';
import { assignTier, assignFamilies } from './families.js';
import { buildProfile } from './profile.js';
import { exhaustiveCases, smokeCases, verifyBatch } from './verify.js';
import type { CatalogEntry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'catalog');

const TRIPLE_SAMPLE = Number(process.env.CATALOG_TRIPLE_SAMPLE ?? 20000);
const FSF_SAMPLE_MIN = Number(process.env.CATALOG_FSF_SAMPLE ?? 2000);

interface Stage { name: string; count: number }

export function generateCombos(tripleSample = TRIPLE_SAMPLE): { combos: RawCombo[]; stages: Stage[] } {
  const singles = prunedSingles();
  const singleCombos: RawCombo[] = singles.map((c) => ({ components: [c] }));
  const pairCombos = pairs(singles);
  const tripleCombos = [...seedClassicCombos(), ...sampledTriples(singles, tripleSample)];
  const stages: Stage[] = [
    { name: 'singles', count: singleCombos.length },
    { name: 'pairs', count: pairCombos.length },
    { name: 'triples (seeded+sampled)', count: tripleCombos.length },
  ];
  return { combos: [...singleCombos, ...pairCombos, ...tripleCombos], stages };
}

export function canonicaliseAndDedupe(combos: RawCombo[]): Map<string, Piece> {
  const byKey = new Map<string, Piece>();
  for (const combo of combos) {
    const piece = comboToPiece(combo);
    const key = canonicalKey(piece);
    if (byKey.has(key)) continue;
    byKey.set(key, piece);
  }
  return byKey;
}

function hasAmbiguousAdjacentAtoms(betza: string): boolean {
  // FSF Betza reinterprets two identical bare atom letters in a row (e.g. "WW")
  // as a multi-leg lame-leaper/rider compound, not two independent terms.
  // Any catalog entry whose exported string hits this is an exporter
  // limitation for this schema — exclude it rather than ship a silent mismatch.
  return /([WFDANHCZG])\1/.test(betza);
}

export function filterValid(canonical: Map<string, Piece>, queenMobilityAvg: number): { entries: Array<{ piece: Piece; betza: string }>; rejected: number } {
  const entries: Array<{ piece: Piece; betza: string }> = [];
  let rejected = 0;
  for (const [key, raw] of canonical) {
    const vectors = expandPiece(raw, 'w');
    const mob = avgMobility(vectors);
    const tier = assignTier(raw, queenMobilityAvg, mob);
    const piece: Piece = { ...raw, tier, name: key.slice(0, 40) };
    if (hasErrors(validatePiece(piece))) { rejected++; continue; }
    let betza: string;
    try { betza = pieceToBetza(piece); } catch (e) {
      if (e instanceof BetzaUnsupported) { rejected++; continue; }
      throw e;
    }
    if (hasAmbiguousAdjacentAtoms(betza)) { rejected++; continue; }
    entries.push({ piece, betza });
  }
  return { entries, rejected };
}

function avgMobility(vectors: Vector[]): number {
  let total = 0;
  for (let sq = 0; sq < 64; sq++) {
    const fx = sq % 8;
    const fy = Math.floor(sq / 8);
    for (const v of vectors) {
      const steps = v.range === Infinity ? 8 : v.range;
      for (let n = 1; n <= steps; n++) {
        const nx = fx + v.dx * n;
        const ny = fy + v.dy * n;
        if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
        total++;
      }
    }
  }
  return total / 64;
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

async function main() {
  const t0 = Date.now();
  const ruleset = getRuleset('2026.2')!;
  const queenVectors = expandPiece(ruleset.pieces.queen!, 'w');
  const queenMobilityAvg = avgMobility(queenVectors);

  const { combos, stages } = generateCombos();
  console.log('[catalog] raw combos:', combos.length, stages);

  const canonical = canonicaliseAndDedupe(combos);
  console.log('[catalog] canonical (deduped, mirror-merged):', canonical.size);

  const { entries: valid, rejected } = filterValid(canonical, queenMobilityAvg);
  console.log('[catalog] valid (validator+capture+betza):', valid.length, 'rejected:', rejected);

  const catalog: CatalogEntry[] = valid.map(({ piece, betza }) => {
    const profile = buildProfile(piece, ruleset);
    const families = assignFamilies(piece, profile);
    return { key: canonicalKey(piece), piece, tier: piece.tier, betza, families, profile };
  });

  // FSF verification: stratified sample of >=500 plus all entries in small families (<50 members).
  const familyCounts = new Map<string, number>();
  for (const e of catalog) for (const f of e.families) familyCounts.set(f, (familyCounts.get(f) ?? 0) + 1);
  const smallFamilyIds = new Set<string>();
  for (const e of catalog) if (e.families.some((f) => (familyCounts.get(f) ?? 0) < 50)) smallFamilyIds.add(e.key);

  const rng = mulberry32(7);
  const shuffled = [...catalog].sort(() => rng() - 0.5);
  const toVerifyKeys = new Set<string>(smallFamilyIds);
  for (const e of shuffled) {
    if (toVerifyKeys.size >= FSF_SAMPLE_MIN) break;
    toVerifyKeys.add(e.key);
  }
  const toVerify = catalog.filter((e) => toVerifyKeys.has(e.key));
  console.log('[catalog] FSF verification sample:', toVerify.length, '/', catalog.length);

  // Exhaustive (every square x every blocker ring) on the sample; smoke probe on EVERY entry.
  const results = verifyBatch([
    ...toVerify.flatMap((e) => exhaustiveCases(e.piece, e.betza)),
    ...catalog.filter((e) => !toVerifyKeys.has(e.key)).flatMap((e) => smokeCases(e.piece, e.betza)),
  ]);
  const mismatches = results.filter((r) => !r.ok);
  console.log('[catalog] FSF mismatches:', mismatches.length, '/', results.length);

  const mismatchKeys = new Set(mismatches.map((m) => m.id));
  const verifiedCatalog = catalog.filter((e) => !mismatchKeys.has(e.piece.id));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'catalog.json.gz'), gzipSync(Buffer.from(JSON.stringify(verifiedCatalog))));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  writeSummary(verifiedCatalog, stages, combos.length, canonical.size, valid.length, toVerify.length, mismatchKeys.size, Number(elapsed), queenMobilityAvg);
  console.log('[catalog] wrote', verifiedCatalog.length, 'entries in', elapsed, 's');
}

function writeSummary(
  catalog: CatalogEntry[],
  stages: Stage[],
  rawCount: number,
  canonicalCount: number,
  validCount: number,
  fsfSampleCount: number,
  mismatchCount: number,
  elapsedSec: number,
  queenMobilityAvg: number,
) {
  const tierCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();
  for (const e of catalog) {
    tierCounts.set(e.tier, (tierCounts.get(e.tier) ?? 0) + 1);
    for (const f of e.families) familyCounts.set(f, (familyCounts.get(f) ?? 0) + 1);
  }
  const mobilities = catalog.map((e) => e.profile.mobilityAvg).sort((a, b) => a - b);
  const bucket = (lo: number, hi: number) => mobilities.filter((m) => m >= lo && m < hi).length;
  const rng = mulberry32(99);
  const examples = [...catalog].sort(() => rng() - 0.5).slice(0, 30);

  const lines: string[] = [
    '# Catalog results',
    '',
    `Generated by \`pnpm --filter @takes/catalog run build\`. Queen mobilityAvg baseline: ${queenMobilityAvg.toFixed(2)}.`,
    '',
    '## Pipeline counts',
    '',
    `- Raw combos generated: ${rawCount} (${stages.map((s) => `${s.name}=${s.count}`).join(', ')})`,
    `- Canonical (deduped + mirror-merged): ${canonicalCount}`,
    `- Valid (validatePiece clean + has capture + Betza export succeeds): ${validCount}`,
    `- FSF verification: exhaustive (all 56 origin squares x blocker rings 1-7) for ${fsfSampleCount} stratified entries; smoke probe (8 squares x rings 1-3) for every other entry. Mismatching entries: ${mismatchCount}`,
    `- Final catalog size (every entry FSF-checked at least by smoke probe): ${catalog.length}`,
    `- Build time: ${elapsedSec}s`,
    '',
    '## Tier counts',
    '',
    ...[...tierCounts.entries()].map(([t, n]) => `- ${t}: ${n}`),
    '',
    '## Family counts',
    '',
    ...[...familyCounts.entries()].map(([f, n]) => `- ${f}: ${n}`),
    '',
    '## Mobility (mobilityAvg) histogram',
    '',
    `- [0,1): ${bucket(0, 1)}`,
    `- [1,2): ${bucket(1, 2)}`,
    `- [2,4): ${bucket(2, 4)}`,
    `- [4,8): ${bucket(4, 8)}`,
    `- [8,16): ${bucket(8, 16)}`,
    `- [16,∞): ${bucket(16, Infinity)}`,
    '',
    '## 30 random examples',
    '',
    '| id | betza | tier | families | mobilityAvg | nearest library |',
    '|---|---|---|---|---|---|',
    ...examples.map((e) => `| ${e.piece.id} | ${e.betza} | ${e.tier} | ${e.families.join(',')} | ${e.profile.mobilityAvg.toFixed(2)} | ${e.profile.nearestLibraryId} (${e.profile.nearestLibraryDistance.toFixed(2)}) |`),
    '',
  ];
  writeFileSync(join(OUT_DIR, 'catalog-summary.md'), lines.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
