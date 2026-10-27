#!/usr/bin/env -S node --experimental-strip-types
/** Full scaled run [pass 2]: shared calibration computed once (saves wall-clock), then every
 * piece-slot combination requested by the orchestrator review:
 *  - knight/bishop controls (minor slot, self-consistency)
 *  - wraith/warden/lancer in BOTH a minor slot and a rook slot (same-tier substitution)
 *  - berolina replacing 1, 2, and N vanilla pawns (same-tier, per-unit)
 * Writes docs/valuation/<piece>-<slot>.json per slot, docs/valuation/all.json aggregate, and
 * docs/valuation/parity-bugs.jsonl for any real (post per-game-variant-fix) parity disagreement.
 * Paths always resolve to the repo root's docs/valuation/, regardless of invocation cwd. */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuleset } from '@takes/library';
import { valuePiece, runCalibration } from '../src/value.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docsDir = (p: string) => resolve(REPO_ROOT, 'docs/valuation', p);

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

interface SlotSpec {
  piece: string;
  slot?: 'minor' | 'rook';
  sameTierCount?: number;
  label: string;
}

async function main() {
  const games = Number(arg('games', '700'));
  const nodes = Number(arg('nodes', '6000'));
  const workers = Number(arg('workers', '12'));
  const seed = Number(arg('seed', '1'));
  const maxIterations = Number(arg('iterations', '2'));
  const calibGamesPerAnchor = Number(arg('calibGamesPerAnchor', '40'));
  const ruleset = getRuleset(arg('ruleset', '2026.1')!);
  if (!ruleset) throw new Error('unknown ruleset');

  const parityBugLog = docsDir('parity-bugs.jsonl');
  mkdirSync(docsDir('.'), { recursive: true });
  rmSync(parityBugLog, { force: true });

  console.error('== shared calibration ==');
  const tCalib = Date.now();
  const calibration = await runCalibration(ruleset, nodes, workers, calibGamesPerAnchor, parityBugLog);
  console.error(`calibration done in ${(Date.now() - tCalib) / 1000}s, parity bugs=${calibration.parityBugs}, excluded=${calibration.excludedGames}, range=[${calibration.range.lo},${calibration.range.hi}]`);
  writeFileSync(docsDir('calibration.json'), JSON.stringify(calibration, null, 2));

  const slots: SlotSpec[] = [
    { piece: 'knight', label: 'knight (control, minor slot)' },
    { piece: 'bishop', label: 'bishop (control, minor slot)' },
    { piece: 'wraith', slot: 'minor', label: 'wraith (minor slot)' },
    { piece: 'wraith', slot: 'rook', label: 'wraith (rook slot)' },
    { piece: 'warden', slot: 'minor', label: 'warden (minor slot)' },
    { piece: 'warden', slot: 'rook', label: 'warden (rook slot)' },
    { piece: 'lancer', slot: 'minor', label: 'lancer (minor slot)' },
    { piece: 'lancer', slot: 'rook', label: 'lancer (rook slot)' },
    { piece: 'berolina', sameTierCount: 1, label: 'berolina (1 pawn, same-tier)' },
    { piece: 'berolina', sameTierCount: 2, label: 'berolina (2 pawns, same-tier)' },
    { piece: 'berolina', sameTierCount: 4, label: 'berolina (4 pawns, same-tier)' },
  ];

  const rows: Array<Record<string, unknown>> = [];
  const tAll0 = Date.now();
  for (const s of slots) {
    console.error(`== ${s.label} ==`);
    const t0 = Date.now();
    const { result, parityBugs, excludedGames } = await valuePiece(ruleset, {
      piece: s.piece,
      games,
      nodes,
      workers,
      seed,
      maxIterations,
      slot: s.slot,
      sameTierCount: s.sameTierCount,
      parityBugLog,
      calibration,
    });
    const row = { ...result, label: s.label, parityBugs, excludedGames, elapsedS: (Date.now() - t0) / 1000 };
    rows.push(row);
    writeFileSync(docsDir(`${s.piece}-${s.slot ?? (s.sameTierCount ? `x${s.sameTierCount}` : 'minor')}.json`), JSON.stringify(row, null, 2));
    console.error(`  estimate=${result.finalEstimate.toFixed(2)} [${result.finalLo.toFixed(2)},${result.finalHi.toFixed(2)}] outOfRange=${result.finalOutOfRange} parityBugs=${parityBugs} excluded=${excludedGames} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  writeFileSync(docsDir('all.json'), JSON.stringify({ calibration, rows, totalElapsedS: (Date.now() - tCalib) / 1000 }, null, 2));
  console.log(JSON.stringify(rows.map((r) => ({ label: r['label'], estimate: r['finalEstimate'], lo: r['finalLo'], hi: r['finalHi'], outOfRange: r['finalOutOfRange'], parityBugs: r['parityBugs'], excluded: r['excludedGames'] })), null, 2));
  console.error(`TOTAL wall clock: ${((Date.now() - tCalib) / 1000 / 60).toFixed(1)} min`);
  void tAll0;
}

main().catch((e) => { console.error(e); process.exit(1); });
