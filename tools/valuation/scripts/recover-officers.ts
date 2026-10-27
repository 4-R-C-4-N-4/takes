/** Same-tier experiments invalidated by calibration/extra-piece bugs. Run after recover.ts. */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuleset } from '@takes/library';
import { valuePiece } from '../src/value.js';
import { runBatch, type GameJob } from '../src/worker-pool.js';
import { classicSetup, str } from '../src/setups.js';
import { mulberry32, randomProfile } from '@takes/perft';
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/valuation/recovery');
async function main() {
  const calibration = JSON.parse(readFileSync(resolve(dir, 'calibration.json'), 'utf8'));
  const ruleset = getRuleset('2026.1')!;
  const nullPath = resolve(dir, 'null-control.json');
  if (existsSync(nullPath)) throw new Error(`refusing to overwrite ${nullPath}`);
  const random = mulberry32(1);
  const jobs: GameJob[] = [];
  let setup = str(classicSetup(ruleset.version));
  for (let i = 0; i < 200; i++) {
    if (i >= 100 && i % 2 === 0) setup = randomProfile(ruleset, random);
    jobs.push({ white: setup, black: setup, nodes: 6000 + (Math.floor(i / 2) % 29) * 37 });
  }
  console.error('running identical-army null control (200 games)');
  const batch = await runBatch(ruleset, jobs, 8);
  const valid = batch.outcomes.filter((o) => !o.excluded);
  const counts = { wins: valid.filter((o) => o.result === 1).length, draws: valid.filter((o) => o.result === 0).length, losses: valid.filter((o) => o.result === -1).length };
  const records = batch.outcomes.flatMap((o, i) => o.excluded ? o.parityBugDetails.map((detail) => ({ piece: 'null-control', ...detail, setups: jobs[i] })) : []);
  if (records.length) appendFileSync(resolve(dir, 'parity-bugs.jsonl'), records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  const nullControl = { kind: 'identical-army-null-control', ...counts, games: valid.length, whiteScore: (counts.wins + counts.draws / 2) / valid.length, fittedWhiteScoreAtZero: 1 / (1 + Math.exp(-calibration.fit.a)), excludedGames: batch.outcomes.length - valid.length, parityBugs: batch.parityBugCount, settings: { games: 200, classic: 100, random: 100, nodes: 6000, workers: 8, seed: 1 }, trials: batch.outcomes.map((o, i) => ({ result: o.result, excluded: o.excluded, stratum: i < 100 ? 'classic' : 'random', pair: Math.floor(i / 2), nodes: jobs[i]!.nodes })) };
  writeFileSync(nullPath, JSON.stringify(nullControl, null, 2) + '\n');
  console.error(JSON.stringify(nullControl, (key, value) => key === 'trials' ? undefined : value));
  for (const piece of ['wraith', 'warden', 'lancer']) {
    const path = resolve(dir, `${piece}-rook-x1.json`);
    if (existsSync(path)) throw new Error(`refusing to overwrite ${path}`);
    console.error(`running corrected ${piece} rook slot`);
    const start = Date.now();
    const data = await valuePiece(getRuleset('2026.1')!, { piece, slot: 'rook', sameTierCount: 1, games: 700, nodes: 6000, workers: 8, seed: 1, maxIterations: 1, calibration, parityBugLog: resolve(dir, 'parity-bugs.jsonl') });
    const report = { ...data.result, parityBugs: data.parityBugs, excludedGames: data.excludedGames, elapsedS: (Date.now() - start) / 1000, settings: { games: 700, nodes: 6000, workers: 8, seed: 1, iterations: 1 }, calibrationSource: 'recovery/calibration.json' };
    writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
    console.error(JSON.stringify({ piece, estimate: report.finalEstimate, lo: report.finalLo, hi: report.finalHi, elapsedS: report.elapsedS }));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
