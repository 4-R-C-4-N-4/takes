/** Orchestrates the value-feedback loop for one piece: calibrate -> play target games -> fit -> inject values -> repeat.
 * [spec "Valuation"; plan-review B9 self-referential feedback loop]. */
import type { Ruleset } from '@takes/library';
import { variantIni, variantName } from '@takes/betza';
import { mulberry32, randomProfile } from '@takes/perft';
import { withPieceValues, pawnsToInternal } from './ini.js';
import { calibrationPairings, swapColors, targetPairing, randomTargetPairing, type Pairing } from './setups.js';
import { runBatch, type GameJob } from './worker-pool.js';
import { fitLogistic, scoreWithCi, bootstrapValueCi, type LogisticFit } from './logistic.js';

/**
 * FSF's promotionPieceTypes option is variant-wide, but the Takes engine's promotion targets are
 * 'own-set' [D6] — restricted to pieces actually present in that color's own army. To keep FSF and
 * Takes in agreement (no parity bugs) we build the ini's promotion lists as exactly the officer ids
 * that can appear across every army used in this run (the classic officers plus the target/reference
 * pair), and we restrict randomProfile() to the same officer pool so no out-of-set promotion is ever
 * offered to FSF. This is an approximation of true per-position own-set promotion, documented here.
 */
function restrictedRuleset(ruleset: Ruleset, officerIds: string[]): Ruleset {
  const keep = new Set([...officerIds, 'pawn']);
  const pieces = Object.fromEntries(Object.entries(ruleset.pieces).filter(([id]) => keep.has(id)));
  const costs = Object.fromEntries(Object.entries(ruleset.costs).filter(([id]) => keep.has(id)));
  const maxCount = Object.fromEntries(Object.entries(ruleset.maxCount).filter(([id]) => keep.has(id)));
  return { ...ruleset, pieces, costs, maxCount };
}

export interface ValueOptions {
  piece: string;
  games: number;
  nodes: number;
  workers: number;
  seed: number;
  maxIterations?: number;
}

export interface IterationRecord {
  iteration: number;
  injectedMg: number | null;
  injectedEg: number | null;
  estimate: number;
  lo: number;
  hi: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  parityBugs: number;
}

export interface ValueResult {
  piece: string;
  referenceId: string;
  referenceValuePawns: number;
  iterations: IterationRecord[];
  finalEstimate: number;
  finalLo: number;
  finalHi: number;
  calibration: { label: string; deltaPawns: number; p: number }[];
  calibrationFit: LogisticFit;
}

function toOutcome(resultWhiteWins1Minus1: 1 | 0 | -1, playedAsWhite: boolean): -1 | 0 | 1 {
  // Normalizes a game outcome into the target piece's own perspective (the color holding piece T).
  if (resultWhiteWins1Minus1 === 0) return 0;
  const whiteWon = resultWhiteWins1Minus1 === 1;
  return playedAsWhite === whiteWon ? 1 : -1;
}

export async function runCalibration(ruleset: Ruleset, ini: string, variant: string, nodesPerGame: number, workers: number, gamesPerAnchor: number) {
  const pairings = calibrationPairings(ruleset);
  const jobs: GameJob[] = [];
  const meta: { label: string; deltaPawns: number }[] = [];
  for (const p of pairings) {
    for (let i = 0; i < gamesPerAnchor; i++) {
      const pp: Pairing = i % 2 === 0 ? p : swapColors(p);
      jobs.push({ white: pp.white, black: pp.black, nodes: nodesPerGame });
      meta.push({ label: p.label, deltaPawns: pp.deltaPawns });
    }
  }
  const batch = await runBatch(ini, variant, ruleset, jobs, workers);
  const byLabel = new Map<string, { deltaPawns: number; wins: number; draws: number; losses: number }>();
  batch.outcomes.forEach((o, i) => {
    const m = meta[i]!;
    const entry = byLabel.get(m.label) ?? { deltaPawns: Math.abs(m.deltaPawns), wins: 0, draws: 0, losses: 0 };
    // Normalize to the "material-favored" side's perspective (white in the unswapped pairing).
    const favoredIsWhite = m.deltaPawns > 0;
    const outcome = o.result === 0 ? 0 : o.result === 1 === favoredIsWhite ? 1 : -1;
    if (outcome === 1) entry.wins++; else if (outcome === -1) entry.losses++; else entry.draws++;
    byLabel.set(m.label, entry);
  });
  const calibration: { label: string; deltaPawns: number; p: number }[] = [];
  const xs: number[] = [];
  const ps: number[] = [];
  for (const [label, e] of byLabel) {
    const { p } = scoreWithCi(e.wins, e.draws, e.losses);
    calibration.push({ label, deltaPawns: e.deltaPawns, p });
    xs.push(e.deltaPawns);
    ps.push(p);
  }
  const fit = fitLogistic(xs, ps);
  return { calibration, fit, parityBugs: batch.parityBugCount };
}

export async function valuePiece(ruleset: Ruleset, opts: ValueOptions): Promise<{ result: ValueResult; parityBugs: number }> {
  const maxIterations = opts.maxIterations ?? 3;
  const variant = variantName(ruleset);
  const { pairing: classicPairing, referenceId, referenceValuePawns } = targetPairing(ruleset, opts.piece);
  // Officers that can legally appear in ANY army used by this run (classic test armies + random-profile
  // armies, which are restricted below to the same pool). Promotion lists in the ini are built from this
  // closed set so FSF never offers a promotion the Takes engine's own-set rule would reject.
  const officerIds = [...new Set(['knight', 'bishop', 'rook', 'queen', opts.piece, referenceId])];
  const baseIni = variantIni(ruleset, { promotion: { w: officerIds, b: officerIds } });
  const randomRuleset = restrictedRuleset(ruleset, [opts.piece, referenceId]);

  const calibGames = Math.max(10, Math.round(opts.games * 0.3));
  const { calibration, fit, parityBugs: calibBugs } = await runCalibration(ruleset, baseIni, variant, opts.nodes, opts.workers, Math.max(2, Math.round(calibGames / 5)));

  const rand = mulberry32(opts.seed);
  let totalParityBugs = calibBugs;
  const iterations: IterationRecord[] = [];
  let estimate = referenceValuePawns;
  let lo = referenceValuePawns - 1;
  let hi = referenceValuePawns + 1;

  for (let iter = 0; iter < maxIterations; iter++) {
    let ini = baseIni;
    let injectedMg: number | null = null;
    let injectedEg: number | null = null;
    if (iter > 0) {
      const { mg, eg } = pawnsToInternal(estimate);
      injectedMg = mg;
      injectedEg = eg;
      ini = withPieceValues(baseIni, ruleset, [{ pieceId: opts.piece, mg, eg }]);
    }

    const classicJobs: GameJob[] = [];
    const half = Math.max(2, Math.floor(opts.games / 2));
    for (let i = 0; i < half; i++) {
      const classic = i % 2 === 0 ? classicPairing : swapColors(classicPairing);
      classicJobs.push({ white: classic.white, black: classic.black, nodes: opts.nodes });
    }
    // Mix in Takes-style blind randomProfile games (spec: "measure from Takes-style blind setups, not only vanilla swaps").
    // These armies only ever contain {pawn, target, referenceId}, so they need their own ini with a
    // matching (narrower) promotion list — reusing the classic ini's wider list (queen/rook/bishop
    // included) would let FSF offer a promotion the Takes engine's own-set rule rejects.
    const randomJobs: GameJob[] = [];
    const randomGames = opts.games - half;
    const randomSideFlags: boolean[] = [];
    for (let i = 0; i < randomGames; i++) {
      const profile = randomProfile(randomRuleset, rand);
      const rp = randomTargetPairing(ruleset, opts.piece, referenceId, profile);
      const useSwap = i % 2 === 1;
      const pp = useSwap ? swapColors(rp) : rp;
      randomJobs.push({ white: pp.white, black: pp.black, nodes: opts.nodes });
      randomSideFlags.push(!useSwap);
    }
    const randomOfficerIds = [...new Set([opts.piece, referenceId])];
    const randomIni = iter > 0
      ? withPieceValues(variantIni(ruleset, { promotion: { w: randomOfficerIds, b: randomOfficerIds } }), ruleset, [{ pieceId: opts.piece, mg: injectedMg!, eg: injectedEg! }])
      : variantIni(ruleset, { promotion: { w: randomOfficerIds, b: randomOfficerIds } });

    const classicBatch = await runBatch(ini, variant, ruleset, classicJobs, opts.workers);
    const randomBatch = randomJobs.length > 0 ? await runBatch(randomIni, variant, ruleset, randomJobs, opts.workers) : { outcomes: [], parityBugCount: 0 };
    totalParityBugs += classicBatch.parityBugCount + randomBatch.parityBugCount;

    const sideFlags = [...Array(half).fill(true).map((_, i) => i % 2 === 0), ...randomSideFlags];
    const outcomesAll = [...classicBatch.outcomes, ...randomBatch.outcomes];
    const outcomes: Array<-1 | 0 | 1> = outcomesAll.map((o, i) => toOutcome(o.result, sideFlags[i]!));
    const wins = outcomes.filter((v) => v === 1).length;
    const draws = outcomes.filter((v) => v === 0).length;
    const losses = outcomes.filter((v) => v === -1).length;
    const boot = bootstrapValueCi(outcomes, fit, referenceValuePawns, 1500, opts.seed + iter);
    const prevEstimate = estimate;
    estimate = boot.estimate;
    lo = boot.lo;
    hi = boot.hi;

    iterations.push({
      iteration: iter,
      injectedMg,
      injectedEg,
      estimate,
      lo,
      hi,
      games: outcomes.length,
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
      referenceId,
      referenceValuePawns,
      iterations,
      finalEstimate: estimate,
      finalLo: lo,
      finalHi: hi,
      calibration,
      calibrationFit: fit,
    },
    parityBugs: totalParityBugs,
  };
}
