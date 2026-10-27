/** Orchestrates the value-feedback loop for one piece: calibrate -> play target games -> fit -> inject values -> repeat.
 * [spec "Valuation"; plan-review B9 self-referential feedback loop].
 *
 * Parity fix: every game is played against a FSF variant built PER GAME from the Takes engine's own
 * `promotionTargets()` for that game's exact starting armies [D6], via worker-pool's perGameVariant().
 * This removes the earlier "officer pool approximation" that caused ~1% parity bugs. Any disagreement
 * remaining after this fix is a genuine engine/FSF divergence: the game is EXCLUDED from scoring (never
 * silently scored as a draw) and logged to docs/valuation/parity-bugs.jsonl with full repro detail.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Ruleset } from '@takes/library';
import { mulberry32, randomProfile } from '@takes/perft';
import { pawnsToInternal } from './ini.js';
import { calibrationPairings, swapColors, targetPairing, sameTierPairing, randomTargetPairing, type Pairing } from './setups.js';
import { runBatch, type GameJob } from './worker-pool.js';
import { fitLogistic, scoreWithCi, bootstrapValueCi, type LogisticFit } from './logistic.js';
import type { GameOutcome } from './game-loop.js';

export interface ValueOptions {
  piece: string;
  games: number;
  nodes: number;
  workers: number;
  seed: number;
  maxIterations?: number;
  /** 'minor' (default): substitute into a knight/bishop slot. 'rook': substitute into a rook slot
   * (same-tier test for rook-tier candidates: warden, wraith, lancer) [problem 2]. */
  slot?: 'minor' | 'rook';
  /** For same-tier tests (e.g. berolina pawns): how many copies of the reference piece to replace. */
  sameTierCount?: number;
  /** Path to append JSONL parity-bug diagnostics to. */
  parityBugLog?: string;
  /** Precomputed calibration (shared across pieces to save wall-clock); if omitted, computed fresh. */
  calibration?: { calibration: { label: string; deltaPawns: number; p: number }[]; fit: LogisticFit; parityBugs: number; excludedGames: number; range: { lo: number; hi: number } };
}

export interface IterationRecord {
  iteration: number;
  injectedMg: number | null;
  injectedEg: number | null;
  estimate: number;
  lo: number;
  hi: number;
  outOfRange: boolean;
  games: number;
  excludedGames: number;
  wins: number;
  draws: number;
  losses: number;
  parityBugs: number;
}

export interface ValueResult {
  piece: string;
  slot: string;
  referenceId: string;
  referenceValuePawns: number;
  iterations: IterationRecord[];
  finalEstimate: number;
  finalLo: number;
  finalHi: number;
  finalOutOfRange: boolean;
  calibration: { label: string; deltaPawns: number; p: number }[];
  calibrationFit: LogisticFit;
  calibrationRange: { lo: number; hi: number };
}

function toOutcome(resultWhiteWins1Minus1: 1 | 0 | -1, playedAsWhite: boolean): -1 | 0 | 1 {
  // Normalizes a game outcome into the target piece's own perspective (the color holding piece T).
  if (resultWhiteWins1Minus1 === 0) return 0;
  const whiteWon = resultWhiteWins1Minus1 === 1;
  return playedAsWhite === whiteWon ? 1 : -1;
}

function logParityBugs(path: string | undefined, piece: string, variant: 'classic' | 'random' | 'calibration', outcomes: GameOutcome[], white: string, black: string): void {
  if (!path) return;
  const records = outcomes.filter((o) => o.excluded).flatMap((o) => o.parityBugDetails.map((d) => ({ piece, variant, fen_before: d.fenBefore, fsf_move: d.fsfMove, engine_legal_moves: d.engineLegalMoves, setups: { white, black } })));
  if (records.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

export async function runCalibration(ruleset: Ruleset, nodesPerGame: number, workers: number, gamesPerAnchor: number, parityBugLog?: string) {
  const pairings = calibrationPairings(ruleset);
  const jobs: GameJob[] = [];
  const meta: { label: string; deltaPawns: number }[] = [];
  for (const p of pairings) {
    for (let i = 0; i < gamesPerAnchor; i++) {
      const pp: Pairing = i % 2 === 0 ? p : swapColors(p);
      // Small per-game node jitter breaks FSF's search determinism (fixed node budget on an
      // identical deterministic position otherwise repeats the same 2 games verbatim regardless
      // of gamesPerAnchor, giving zero real statistical signal beyond n=2).
      jobs.push({ white: pp.white, black: pp.black, nodes: nodesPerGame + (i % 29) * 37 });
      meta.push({ label: p.label, deltaPawns: pp.deltaPawns });
    }
  }
  const batch = await runBatch(ruleset, jobs, workers);
  logParityBugs(parityBugLog, 'calibration', 'calibration', batch.outcomes, 'various', 'various');
  // Bucket by the ACTUAL signed delta from White's perspective (not by label) and score White's
  // literal win rate. Bucketing by "favored side" probability instead (as before) folds +x and -x
  // into a symmetric V-shape in logit space that a linear logistic fit cannot represent — that was
  // the root cause of the earlier degenerate near-zero-slope fit.
  const byDelta = new Map<number, { wins: number; draws: number; losses: number; excluded: number }>();
  const byLabel = new Map<string, { deltaPawns: number; wins: number; draws: number; losses: number; excluded: number }>();
  batch.outcomes.forEach((o, i) => {
    const m = meta[i]!;
    const dEntry = byDelta.get(m.deltaPawns) ?? { wins: 0, draws: 0, losses: 0, excluded: 0 };
    const lEntry = byLabel.get(m.label) ?? { deltaPawns: Math.abs(m.deltaPawns), wins: 0, draws: 0, losses: 0, excluded: 0 };
    if (o.excluded) { dEntry.excluded++; lEntry.excluded++; byDelta.set(m.deltaPawns, dEntry); byLabel.set(m.label, lEntry); return; }
    if (o.result === 1) dEntry.wins++; else if (o.result === -1) dEntry.losses++; else dEntry.draws++;
    // Label summary always reported from the material-favored side's perspective (human-readable).
    const favoredIsWhite = m.deltaPawns > 0;
    const favOutcome = o.result === 0 ? 0 : o.result === 1 === favoredIsWhite ? 1 : -1;
    if (favOutcome === 1) lEntry.wins++; else if (favOutcome === -1) lEntry.losses++; else lEntry.draws++;
    byDelta.set(m.deltaPawns, dEntry);
    byLabel.set(m.label, lEntry);
  });
  const calibration: { label: string; deltaPawns: number; p: number }[] = [];
  for (const [label, e] of byLabel) {
    const { p } = scoreWithCi(e.wins, e.draws, e.losses);
    calibration.push({ label, deltaPawns: e.deltaPawns, p });
  }
  const xs: number[] = [];
  const ps: number[] = [];
  const weights: number[] = [];
  let minAnchor = Infinity;
  let maxAnchor = -Infinity;
  for (const [delta, e] of byDelta) {
    const { p } = scoreWithCi(e.wins, e.draws, e.losses);
    xs.push(delta);
    ps.push(p);
    weights.push(e.wins + e.draws + e.losses);
    minAnchor = Math.min(minAnchor, delta);
    maxAnchor = Math.max(maxAnchor, delta);
  }
  const fit = fitLogistic(xs, ps, 4000, 0.05, weights);
  return { calibration, fit, parityBugs: batch.parityBugCount, excludedGames: batch.outcomes.filter((o) => o.excluded).length, range: { lo: minAnchor, hi: maxAnchor } };
}

export async function valuePiece(ruleset: Ruleset, opts: ValueOptions): Promise<{ result: ValueResult; parityBugs: number; excludedGames: number }> {
  const maxIterations = opts.maxIterations ?? 3;
  const slot = opts.slot ?? 'minor';
  let classicPairing: Pairing;
  let referenceId: string;
  let referenceValuePawns: number;
  if (slot === 'rook') {
    ({ pairing: classicPairing, referenceId, referenceValuePawns } = sameTierPairing(ruleset, opts.piece, 'rook', 5, opts.sameTierCount ?? 1));
  } else if (opts.sameTierCount && opts.sameTierCount > 1) {
    const ref = opts.piece === 'knight' ? 'bishop' : 'knight';
    ({ pairing: classicPairing, referenceId, referenceValuePawns } = sameTierPairing(ruleset, opts.piece, ref, 3, opts.sameTierCount));
  } else {
    ({ pairing: classicPairing, referenceId, referenceValuePawns } = targetPairing(ruleset, opts.piece));
  }

  const calibGames = Math.max(10, Math.round(opts.games * 0.3));
  const { calibration, fit, parityBugs: calibBugs, excludedGames: calibExcluded, range } = opts.calibration
    ?? await runCalibration(ruleset, opts.nodes, opts.workers, Math.max(30, Math.round(calibGames / 12)), opts.parityBugLog);

  const rand = mulberry32(opts.seed);
  let totalParityBugs = calibBugs;
  let totalExcluded = calibExcluded;
  const iterations: IterationRecord[] = [];
  let estimate = referenceValuePawns;
  let lo = referenceValuePawns - 1;
  let hi = referenceValuePawns + 1;
  let outOfRangeFinal = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    let overrides: { pieceId: string; mg: number; eg: number }[] = [];
    let injectedMg: number | null = null;
    let injectedEg: number | null = null;
    if (iter > 0) {
      const { mg, eg } = pawnsToInternal(estimate);
      injectedMg = mg;
      injectedEg = eg;
      overrides = [{ pieceId: opts.piece, mg, eg }];
    }

    const classicJobs: GameJob[] = [];
    const half = Math.max(2, Math.floor(opts.games / 2));
    for (let i = 0; i < half; i++) {
      const classic = i % 2 === 0 ? classicPairing : swapColors(classicPairing);
      classicJobs.push({ white: classic.white, black: classic.black, nodes: opts.nodes + (i % 29) * 37, pieceValueOverrides: overrides });
    }
    const randomJobs: GameJob[] = [];
    const randomGames = opts.games - half;
    const randomSideFlags: boolean[] = [];
    const randomRefId = slot === 'rook' ? 'rook' : (opts.piece === 'knight' ? 'bishop' : 'knight');
    for (let i = 0; i < randomGames; i++) {
      const profile = randomProfile(ruleset, rand);
      const rp = randomTargetPairing(ruleset, opts.piece, randomRefId, profile);
      const useSwap = i % 2 === 1;
      const pp = useSwap ? swapColors(rp) : rp;
      randomJobs.push({ white: pp.white, black: pp.black, nodes: opts.nodes, pieceValueOverrides: overrides });
      randomSideFlags.push(!useSwap);
    }

    const classicBatch = await runBatch(ruleset, classicJobs, opts.workers);
    const randomBatch = randomJobs.length > 0 ? await runBatch(ruleset, randomJobs, opts.workers) : { outcomes: [], parityBugCount: 0 };
    logParityBugs(opts.parityBugLog, opts.piece, 'classic', classicBatch.outcomes, classicPairing.white, classicPairing.black);
    logParityBugs(opts.parityBugLog, opts.piece, 'random', randomBatch.outcomes, 'various', 'various');
    totalParityBugs += classicBatch.parityBugCount + randomBatch.parityBugCount;

    const sideFlags = [...Array(half).fill(true).map((_, i) => i % 2 === 0), ...randomSideFlags];
    const outcomesAllRaw = [...classicBatch.outcomes, ...randomBatch.outcomes];
    const excludedCount = outcomesAllRaw.filter((o) => o.excluded).length;
    totalExcluded += excludedCount;
    const outcomes: Array<-1 | 0 | 1> = outcomesAllRaw
      .map((o, i) => ({ o, flag: sideFlags[i]! }))
      .filter(({ o }) => !o.excluded)
      .map(({ o, flag }) => toOutcome(o.result, flag));
    const wins = outcomes.filter((v) => v === 1).length;
    const draws = outcomes.filter((v) => v === 0).length;
    const losses = outcomes.filter((v) => v === -1).length;
    const boot = bootstrapValueCi(outcomes, fit, referenceValuePawns, 1500, opts.seed + iter, range);
    const prevEstimate = estimate;
    // Damp the feedback step [problem 3]: average the new estimate with the previous one so an
    // over/undershoot doesn't compound across iterations and diverge.
    estimate = iter === 0 ? boot.estimate : (boot.estimate + prevEstimate) / 2;
    lo = boot.lo;
    hi = boot.hi;
    outOfRangeFinal = boot.outOfRange;

    iterations.push({
      iteration: iter,
      injectedMg,
      injectedEg,
      estimate,
      lo,
      hi,
      outOfRange: boot.outOfRange,
      games: outcomes.length,
      excludedGames: excludedCount,
      wins,
      draws,
      losses,
      parityBugs: classicBatch.parityBugCount + randomBatch.parityBugCount,
    });

    const halfWidth = (hi - lo) / 2;
    if (Math.abs(estimate - prevEstimate) < halfWidth) break;
  }

  return {
    result: {
      piece: opts.piece,
      slot,
      referenceId,
      referenceValuePawns,
      iterations,
      finalEstimate: estimate,
      finalLo: lo,
      finalHi: hi,
      finalOutOfRange: outOfRangeFinal,
      calibration,
      calibrationFit: fit,
      calibrationRange: range,
    },
    parityBugs: totalParityBugs,
    excludedGames: totalExcluded,
  };
}
