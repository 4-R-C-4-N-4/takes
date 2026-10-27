/** Targeted recovery; never overwrites historical outputs. */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuleset } from '@takes/library';
import { runCalibration, valuePiece } from '../src/value.js';
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/valuation/recovery');
mkdirSync(dir, { recursive: true });
const ruleset = getRuleset('2026.1')!;
const save = (name: string, value: unknown) => {
  const path = resolve(dir, `${name}.json`);
  if (existsSync(path)) throw new Error(`refusing to overwrite ${path}`);
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
};
async function main() {
  const log = resolve(dir, 'parity-bugs.jsonl');
  console.error('corrected calibration: 40 games/anchor, 6000 nodes, 8 workers');
  const calibration = await runCalibration(ruleset, 6000, 8, 40, log);
  save('calibration', calibration);
  for (const [piece, slot, count] of [
    ['knight', 'minor', 1], ['bishop', 'minor', 1],
    ['berolina', 'pawn', 1], ['berolina', 'pawn', 2], ['berolina', 'pawn', 4],
  ] as const) {
    console.error(`running ${piece}-${slot}-x${count}`);
    const start = Date.now();
    const data = await valuePiece(ruleset, { piece, slot, sameTierCount: count, games: 700, nodes: 6000, workers: 8, seed: 1, maxIterations: 1, calibration, parityBugLog: log });
    const report = { ...data.result, parityBugs: data.parityBugs, excludedGames: data.excludedGames, elapsedS: (Date.now() - start) / 1000, settings: { games: 700, nodes: 6000, workers: 8, seed: 1, iterations: 1 }, calibrationSource: 'recovery/calibration.json' };
    save(`${piece}-${slot}-x${count}`, report);
    console.error(JSON.stringify({ piece, count, estimate: report.finalEstimate, lo: report.finalLo, hi: report.finalHi, excluded: report.excludedGames, elapsedS: report.elapsedS }));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
