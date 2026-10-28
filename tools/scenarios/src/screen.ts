/** Orchestrates one candidate's scenario games: builds armies (half classic-like, half random
 * profiles containing the reference piece; each pairing played with colors swapped [req. 1]),
 * runs them through the worker pool with caching, and aggregates ScenarioMetrics. */
import type { Ruleset } from '@takes/library';
import type { CatalogEntry, ScenarioMetrics, ScreenedEntry } from '@takes/catalog';
import { mulberry32 } from '@takes/perft';
import { classicSetup, str } from '@takes/valuation';
import { buildCandidateRuleset } from './candidate-ruleset.js';
import { tierSubstitution, buildCandidateArmy } from './substitution.js';
import { runScenarioBatch, jitteredNodes, type ScenarioJob } from './scenario-worker-pool.js';
import type { CandidateGameResult } from './scenario-game-loop.js';
import { aggregateMetrics } from './composite.js';
import { loadCache, saveCache, cacheKey, gamesNeeded, type CacheSettings } from './cache.js';

export interface ScreenSettings {
  nodes: number;
  stage: 'B' | 'C';
  games: number;
  costPawns: number;
  cacheDir: string;
  seed: number;
}

export const DEFAULT_SETTINGS = (stage: 'B' | 'C'): Omit<ScreenSettings, 'games'> => ({
  nodes: 3000, stage, costPawns: 3, cacheDir: '.scenario-cache', seed: 1,
});

function opponentArmy(r: Ruleset): string {
  // unmodified reference army for the opponent side [req. 1]
  return str(classicSetup(r.version));
}


export interface ScreenOutcome {
  entry: ScreenedEntry;
  wallMs: number;
  gamesPlayed: number;
}

export async function screenCandidate(base: Ruleset, catalogEntry: CatalogEntry, settings: ScreenSettings, workers: number): Promise<ScreenOutcome> {
  const { ruleset, candidateId } = buildCandidateRuleset(base, catalogEntry, settings.costPawns);
  const sub = tierSubstitution(catalogEntry.tier);
  const opp = opponentArmy(ruleset);

  const cacheSettings: CacheSettings = { stage: settings.stage, nodes: settings.nodes, rulesetVersion: ruleset.version, costPawns: settings.costPawns, candidateId };
  const key = cacheKey(catalogEntry.key, cacheSettings);
  const cached = loadCache(settings.cacheDir, key);
  const existing = cached?.results ?? [];
  const toPlay = gamesNeeded(existing, settings.games);

  const start = Date.now();
  let newResults: CandidateGameResult[] = [];
  if (toPlay > 0) {
    const rand = mulberry32(settings.seed + existing.length);
    const jobs: ScenarioJob[] = [];
    for (let i = 0; i < toPlay; i++) {
      const gameIndex = existing.length + i;
      const useRandom = gameIndex % 2 === 1; // half classic, half random profile
      const candidateColor: 'w' | 'b' = gameIndex % 2 === 0 ? 'w' : 'b'; // swap colors each pairing
      const army = buildCandidateArmy(ruleset, candidateId, sub, useRandom, settings.seed * 1000 + gameIndex);
      const nodes = jitteredNodes(settings.nodes, rand);
      jobs.push(
        candidateColor === 'w'
          ? { white: army, black: opp, candidateId, candidateColor, nodes }
          : { white: opp, black: army, candidateId, candidateColor, nodes },
      );
    }
    newResults = await runScenarioBatch(ruleset, jobs, workers);
  }
  const allResults = [...existing, ...newResults];
  saveCache(settings.cacheDir, { key, settings: cacheSettings, results: allResults });
  const wallMs = Date.now() - start;

  const metrics: ScenarioMetrics = aggregateMetrics(allResults);
  const entry: ScreenedEntry = { ...catalogEntry, metrics, replaced: sub.referenceId, stage: settings.stage };
  return { entry, wallMs, gamesPlayed: toPlay };
}
