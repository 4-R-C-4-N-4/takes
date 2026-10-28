/** Aggregates raw per-game CandidateGameResult[] into the exact ScenarioMetrics shape [CONTRACT],
 * and the stage B -> C composite ranking [req. 3]. */
import type { ScenarioMetrics } from '@takes/catalog';
import type { CandidateGameResult } from './scenario-game-loop.js';

/** Nominal 95% bootstrap-style CI on the mean score using a normal approximation (fast, no resampling
 * loop needed at these game counts; documented as "nominal" in the CONTRACT's own comment). */
function scoreCI(score: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const se = Math.sqrt(Math.max(score * (1 - score), 1e-6) / n);
  const lo = Math.max(0, score - 1.96 * se);
  const hi = Math.min(1, score + 1.96 * se);
  return [lo, hi];
}

export function aggregateMetrics(results: CandidateGameResult[]): ScenarioMetrics {
  const scored = results.filter((r) => !r.excluded);
  const excluded = results.length - scored.length;
  const games = scored.length;
  const points = scored.reduce((sum, r) => {
    const win = r.candidateColor === 'w' ? 1 : -1;
    if (r.result === 0) return sum + 0.5;
    return sum + (r.result === win ? 1 : 0);
  }, 0);
  const score = games > 0 ? points / games : 0;
  const sum = (f: (r: CandidateGameResult) => number) => scored.reduce((a, r) => a + f(r), 0);
  const avg = (f: (r: CandidateGameResult) => number) => (games > 0 ? sum(f) / games : 0);
  const decisive = games > 0 ? scored.filter((r) => r.result !== 0).length / games : 0;
  const survival = games > 0 ? scored.filter((r) => r.candidateAlive).length / games : 0;
  const decisiveGames = scored.filter((r) => r.result !== 0);
  const finalAttack = decisiveGames.length > 0 ? decisiveGames.filter((r) => r.finalAttack).length / decisiveGames.length : 0;
  return {
    games, excluded, score, scoreCI: scoreCI(score, games),
    movesPerGame: avg((r) => r.candidateMoves),
    capturesPerGame: avg((r) => r.candidateCaptures),
    checksPerGame: avg((r) => r.candidateChecks),
    forksPerGame: avg((r) => r.candidateForks),
    survival, finalAttack,
    avgPlies: avg((r) => r.plies),
    decisive,
  };
}

export interface CompositeWeights {
  score: number;
  moves: number;
  forks: number;
  checks: number;
  excludedPenalty: number;
}

/** Default composite: z(score) + z(movesPerGame) + z(forksPerGame) + 0.5*z(checksPerGame), minus a
 * penalty if any games were excluded (parity aborts), so screening favours strong AND active
 * pieces rather than only decisive-score ones [req. 3]. Weights are configurable by the caller. */
export const DEFAULT_WEIGHTS: CompositeWeights = { score: 1, moves: 1, forks: 1, checks: 0.5, excludedPenalty: 5 };

function zscores(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd < 1e-9) return values.map(() => 0);
  return values.map((v) => (v - mean) / sd);
}

export interface CompositeInput {
  id: string;
  metrics: ScenarioMetrics;
}

export interface CompositeResult {
  id: string;
  composite: number;
  metrics: ScenarioMetrics;
}

/** Ranks a family's candidates by composite score, highest first. */
export function rankByComposite(entries: CompositeInput[], weights: CompositeWeights = DEFAULT_WEIGHTS): CompositeResult[] {
  if (entries.length === 0) return [];
  const zScore = zscores(entries.map((e) => e.metrics.score));
  const zMoves = zscores(entries.map((e) => e.metrics.movesPerGame));
  const zForks = zscores(entries.map((e) => e.metrics.forksPerGame));
  const zChecks = zscores(entries.map((e) => e.metrics.checksPerGame));
  const out: CompositeResult[] = entries.map((e, i) => {
    const penalty = e.metrics.excluded > 0 ? weights.excludedPenalty : 0;
    const composite =
      weights.score * zScore[i]! +
      weights.moves * zMoves[i]! +
      weights.forks * zForks[i]! +
      weights.checks * zChecks[i]! -
      penalty;
    return { id: e.id, composite, metrics: e.metrics };
  });
  out.sort((a, b) => b.composite - a.composite);
  return out;
}
