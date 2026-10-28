/** Worker pool for scenario games: reuses @takes/valuation's per-game exact-promotion variant
 * construction [D6] and FSF process driver, but plays through playScenarioGame to capture
 * candidate metrics. Max 10 FSF processes (machine shared, per task spec). */
import { variantIni } from '@takes/betza';
import { createGame } from '@takes/engine';
import { FsfProcess } from '@takes/valuation';
import type { Ruleset, Color } from '@takes/library';
import { playScenarioGame, type CandidateGameResult } from './scenario-game-loop.js';

export interface ScenarioJob {
  white: string;
  black: string;
  candidateId: string;
  candidateColor: Color;
  nodes: number;
}

let variantCounter = 0;

export function perGameVariant(ruleset: Ruleset, white: string, black: string): { ini: string; name: string } {
  const g = createGame(ruleset, white, black);
  const name = `takes_scn${(variantCounter++).toString(36)}`;
  const ini = variantIni(ruleset, { name, promotion: { w: g.promotionTargets('w'), b: g.promotionTargets('b') } });
  return { ini, name };
}

export const MAX_WORKERS = 10;

export async function runScenarioBatch(ruleset: Ruleset, jobs: ScenarioJob[], workers = MAX_WORKERS): Promise<CandidateGameResult[]> {
  if (!Number.isInteger(workers) || workers < 1) throw new Error('workers must be a positive integer');
  if (jobs.length === 0) return [];
  const n = Math.max(1, Math.min(workers, MAX_WORKERS, jobs.length));
  const procs: FsfProcess[] = [];
  const outcomes: CandidateGameResult[] = new Array(jobs.length);
  try {
    for (let i = 0; i < n; i++) {
      const p = new FsfProcess(16);
      procs.push(p);
      await p.start();
    }
    let next = 0;
    const worker = async (p: FsfProcess) => {
      for (;;) {
        const i = next++;
        if (i >= jobs.length) break;
        const job = jobs[i]!;
        const { ini, name } = perGameVariant(ruleset, job.white, job.black);
        await p.setVariant(ini, name);
        await p.newGame();
        outcomes[i] = await playScenarioGame(p, ruleset, job.white, job.black, job.candidateId, job.candidateColor, job.nodes);
      }
    };
    await Promise.all(procs.map(worker));
  } finally {
    for (const p of procs) p.quit();
  }
  return outcomes;
}

/** Small deterministic node-count jitter so games in a batch aren't bit-identical [req. 2]. */
export function jitteredNodes(base: number, rand: () => number, spread = 0.1): number {
  const delta = (rand() * 2 - 1) * spread * base;
  return Math.max(100, Math.round(base + delta));
}
