#!/usr/bin/env -S node --experimental-strip-types
/** CLI: pnpm --filter @takes/valuation run value -- --piece wraith --games 400 --nodes 10000 --workers 8 --seed 1 --out docs/valuation/wraith.json */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { getRuleset } from '@takes/library';
import { valuePiece } from '../src/value.js';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const piece = arg('piece');
  if (!piece) throw new Error('--piece is required');
  const games = Number(arg('games', '200'));
  const nodes = Number(arg('nodes', '10000'));
  const workers = Number(arg('workers', '8'));
  const seed = Number(arg('seed', '1'));
  const out = arg('out');
  const ruleset = getRuleset(arg('ruleset', '2026.1')!);
  if (!ruleset) throw new Error('unknown ruleset');
  if (!ruleset.pieces[piece]) throw new Error(`unknown piece '${piece}'`);

  if (out && existsSync(out)) throw new Error(`refusing to overwrite ${out}`);
  const slot = arg('slot', piece === 'berolina' ? 'pawn' : 'minor');
  if (slot !== 'minor' && slot !== 'rook' && slot !== 'pawn') throw new Error('invalid slot');
  const sameTierCount = Number(arg('count', '1'));
  const maxIterations = Number(arg('iterations', '2'));
  const t0 = Date.now();
  const { result, parityBugs, excludedGames } = await valuePiece(ruleset, { piece, games, nodes, workers, seed, slot, sameTierCount, maxIterations, parityBugLog: out ? `${out}.parity.jsonl` : undefined });
  const elapsedS = (Date.now() - t0) / 1000;
  const report = { ...result, parityBugs, excludedGames, elapsedS };
  console.log(JSON.stringify(report, null, 2));
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
