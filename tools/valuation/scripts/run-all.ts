#!/usr/bin/env -S node --experimental-strip-types
/** Runs valuePiece() over all non-king, non-classic pieces plus knight & bishop controls. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { getRuleset } from '@takes/library';
import { valuePiece } from '../src/value.js';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const CLASSIC = new Set(['king', 'pawn', 'queen', 'rook']);

async function main() {
  const games = Number(arg('games', '120'));
  const nodes = Number(arg('nodes', '8000'));
  const workers = Number(arg('workers', '8'));
  const seed = Number(arg('seed', '1'));
  const ruleset = getRuleset(arg('ruleset', '2026.1')!);
  if (!ruleset) throw new Error('unknown ruleset');
  const targets = Object.keys(ruleset.pieces).filter((id) => !CLASSIC.has(id));

  const rows: Array<Record<string, unknown>> = [];
  for (const piece of targets) {
    console.error(`== ${piece} ==`);
    const t0 = Date.now();
    const { result, parityBugs } = await valuePiece(ruleset, { piece, games, nodes, workers, seed });
    rows.push({ ...result, parityBugs, elapsedS: (Date.now() - t0) / 1000 });
    mkdirSync('docs/valuation', { recursive: true });
    writeFileSync(`docs/valuation/${piece}.json`, JSON.stringify(rows[rows.length - 1], null, 2));
  }
  writeFileSync('docs/valuation/all.json', JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows.map((r) => ({ piece: r['piece'], estimate: r['finalEstimate'], lo: r['finalLo'], hi: r['finalHi'] })), null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
