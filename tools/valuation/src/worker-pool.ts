/** Runs a batch of games across a fixed pool of long-lived FSF processes (max 12, Threads=1, Hash=16). */
import { FsfProcess } from './uci.js';
import { playGame, type GameOutcome } from './game-loop.js';
import type { Ruleset } from '@takes/library';

export interface GameJob {
  white: string;
  black: string;
  nodes: number;
}

export interface BatchResult {
  outcomes: GameOutcome[];
  parityBugCount: number;
}

export async function runBatch(ini: string, variant: string, ruleset: Ruleset, jobs: GameJob[], workers = 12): Promise<BatchResult> {
  const n = Math.max(1, Math.min(workers, 12, jobs.length || 1));
  const procs: FsfProcess[] = [];
  for (let i = 0; i < n; i++) {
    const p = new FsfProcess(16);
    await p.init(ini, variant);
    procs.push(p);
  }
  const outcomes: GameOutcome[] = new Array(jobs.length);
  let next = 0;
  const worker = async (p: FsfProcess) => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) break;
      await p.newGame();
      const job = jobs[i]!;
      outcomes[i] = await playGame(p, ruleset, job.white, job.black, job.nodes);
    }
  };
  try {
    await Promise.all(procs.map(worker));
  } finally {
    for (const p of procs) p.quit();
  }
  const parityBugCount = outcomes.reduce((a, o) => a + o.parityBugs.length, 0);
  return { outcomes, parityBugCount };
}
