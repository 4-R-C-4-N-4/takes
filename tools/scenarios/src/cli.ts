#!/usr/bin/env node
/** Scenario screening CLI [req. 7]: stage B all candidates, rank per family by composite,
 * stage C rerun top K per family, write docs/catalog/shortlist.{md,json} + a contact sheet. */
import { getRuleset } from '@takes/library';
import type { CatalogEntry, ScreenedEntry } from '@takes/catalog';
import { mkdirSync, writeFileSync } from 'node:fs';
import { FIXTURE_CATALOG } from './fixtures.js';
import { screenCandidate, DEFAULT_SETTINGS } from './screen.js';
import { rankByComposite, DEFAULT_WEIGHTS, type CompositeWeights } from './composite.js';
import { renderShortlistMd } from './report.js';

interface CliOptions {
  catalogPath?: string;
  stageBGames: number;
  stageCGames: number;
  topK: number;
  workers: number;
  cacheDir: string;
  outDir: string;
  weights: CompositeWeights;
  /** Stage A: stratified sample size per family (0 = all). */
  samplePerFamily?: number;
  seed?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { stageBGames: 40, stageCGames: 160, topK: 3, workers: 10, cacheDir: '.scenario-cache', outDir: 'docs/catalog', weights: DEFAULT_WEIGHTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i]!;
    if (a === '--catalog') opts.catalogPath = next();
    else if (a === '--stage-b-games') opts.stageBGames = Number(next());
    else if (a === '--stage-c-games') opts.stageCGames = Number(next());
    else if (a === '--top-k') opts.topK = Number(next());
    else if (a === '--workers') opts.workers = Number(next());
    else if (a === '--cache-dir') opts.cacheDir = next();
    else if (a === '--out-dir') opts.outDir = next();
    else if (a === '--sample-per-family') opts.samplePerFamily = Number(next());
    else if (a === '--seed') opts.seed = Number(next());
  }
  return opts;
}

async function loadCatalog(opts: CliOptions): Promise<CatalogEntry[]> {
  if (!opts.catalogPath) return FIXTURE_CATALOG;
  // Real catalog loader (tools/catalog) is expected to export loadCatalog(path) once it lands.
  const mod = (await import('@takes/catalog')) as unknown as { loadCatalog?: (p: string) => Promise<CatalogEntry[]> };
  if (!mod.loadCatalog) throw new Error('--catalog given but @takes/catalog has no loadCatalog() yet');
  return mod.loadCatalog(opts.catalogPath);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);
  const ruleset = getRuleset('2026.2');
  if (!ruleset) throw new Error("ruleset '2026.2' not found");
  const full = await loadCatalog(opts);
  // Stage A: drop exact library duplicates, then take a stratified per-family sample (PLAN.md step 4).
  let catalog = full.filter((e) => e.profile.nearestLibraryDistance > 0 || !opts.catalogPath);
  if (opts.samplePerFamily) {
    const { stratifiedSample } = await import('@takes/catalog');
    catalog = stratifiedSample(catalog, opts.samplePerFamily, opts.seed ?? 42);
  }
  console.log(`[stage A] ${full.length} catalog entries -> ${catalog.length} candidates`);

  const timings: Array<{ id: string; stage: string; ms: number; games: number }> = [];

  // Stage B: every candidate.
  const stageB: ScreenedEntry[] = [];
  for (const entry of catalog) {
    const settings = { ...DEFAULT_SETTINGS('B'), games: opts.stageBGames };
    const out = await screenCandidate(ruleset, entry, { ...settings, cacheDir: opts.cacheDir }, opts.workers);
    stageB.push(out.entry);
    timings.push({ id: entry.piece.id, stage: 'B', ms: out.wallMs, games: out.gamesPlayed });
    const msPerGame = out.gamesPlayed > 0 ? Math.round(out.wallMs / out.gamesPlayed) : 0;
    console.log(`[stage B] ${entry.piece.id}: ${out.gamesPlayed} games in ${out.wallMs}ms (${msPerGame}ms/game)`);
  }

  // Rank per family (a candidate may belong to several families; rank within each).
  const families = new Set(catalog.flatMap((c) => c.families));
  const topByFamily = new Map<string, ScreenedEntry[]>();
  for (const fam of families) {
    const inFamily = stageB.filter((e) => e.families.includes(fam));
    const ranked = rankByComposite(inFamily.map((e) => ({ id: e.piece.id, metrics: e.metrics })), opts.weights);
    const top = ranked.slice(0, opts.topK).map((r) => inFamily.find((e) => e.piece.id === r.id)!);
    topByFamily.set(fam, top);
  }
  const topIds = new Set([...topByFamily.values()].flat().map((e) => e.piece.id));

  // Stage C: rerun the union of per-family top-K with more games.
  const stageC: ScreenedEntry[] = [];
  for (const entry of catalog) {
    if (!topIds.has(entry.piece.id)) continue;
    const settings = { ...DEFAULT_SETTINGS('C'), games: opts.stageCGames };
    const out = await screenCandidate(ruleset, entry, { ...settings, cacheDir: opts.cacheDir }, opts.workers);
    stageC.push(out.entry);
    timings.push({ id: entry.piece.id, stage: 'C', ms: out.wallMs, games: out.gamesPlayed });
    const msPerGame = out.gamesPlayed > 0 ? Math.round(out.wallMs / out.gamesPlayed) : 0;
    console.log(`[stage C] ${entry.piece.id}: ${out.gamesPlayed} games in ${out.wallMs}ms (${msPerGame}ms/game)`);
  }

  // Final per-family ranking uses stage C results where available, else stage B.
  const byId = new Map<string, ScreenedEntry>([...stageB, ...stageC].map((e) => [e.piece.id, e]));
  const finalByFamily = new Map<string, ScreenedEntry[]>();
  for (const [fam, top] of topByFamily) {
    finalByFamily.set(fam, top.map((e) => byId.get(e.piece.id) ?? e));
  }

  mkdirSync(opts.outDir, { recursive: true });
  const json = Object.fromEntries([...finalByFamily].map(([fam, entries]) => [fam, entries]));
  writeFileSync(`${opts.outDir}/shortlist.json`, JSON.stringify(json, null, 2));
  writeFileSync(`${opts.outDir}/shortlist.md`, renderShortlistMd(finalByFamily, timings));
  console.log(`wrote ${opts.outDir}/shortlist.json and shortlist.md`);
  console.log('timings:', JSON.stringify(timings));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exitCode = 1; });
}
