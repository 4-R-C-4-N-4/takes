/** Runs a batch of games across a fixed pool of long-lived FSF processes (max 8, Threads=1, Hash=16).
 * Each game gets its OWN FSF variant whose promotionPieceTypes exactly match the Takes engine's
 * own-set promotion targets for that game's starting armies [D6] — eliminates the approximation
 * that caused parity bugs. FSF accepts re-setting VariantPath/UCI_Variant repeatedly in one
 * long-lived process (verified empirically), so no per-game process restart is needed. */
import { createGame } from '@takes/engine';
import { variantIni } from '@takes/betza';
import { FsfProcess } from './uci.js';
import { playGame, type GameOutcome } from './game-loop.js';
import type { Ruleset } from '@takes/library';
import { withPieceValues, type PieceValueOverride } from './ini.js';

export interface GameJob {
  white: string;
  black: string;
  nodes: number;
  pieceValueOverrides?: PieceValueOverride[];
}

export interface BatchResult {
  outcomes: GameOutcome[];
  parityBugCount: number;
}

let variantCounter = 0;

/** Builds the exact-promotion variant ini + name for one game's starting armies. */
export function perGameVariant(ruleset: Ruleset, white: string, black: string, overrides: PieceValueOverride[] = []): { ini: string; name: string } {
  const g = createGame(ruleset, white, black);
  const name = `takes_g${(variantCounter++).toString(36)}`;
  let ini = variantIni(ruleset, { name, promotion: { w: g.promotionTargets('w'), b: g.promotionTargets('b') } });
  if (overrides.length > 0) ini = withPieceValues(ini, ruleset, overrides);
  return { ini, name };
}

export async function runBatch(ruleset: Ruleset, jobs: GameJob[], workers = 8): Promise<BatchResult> {
  if (!Number.isInteger(workers) || workers < 1) throw new Error('workers must be a positive integer');
  if (jobs.length === 0) return { outcomes: [], parityBugCount: 0 };
  const n = Math.max(1, Math.min(workers, 8, jobs.length || 1));
  const procs: FsfProcess[] = [];
  const outcomes: GameOutcome[] = new Array(jobs.length);
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
        const { ini, name } = perGameVariant(ruleset, job.white, job.black, job.pieceValueOverrides ?? []);
        await p.setVariant(ini, name);
        await p.newGame();
        outcomes[i] = await playGame(p, ruleset, job.white, job.black, job.nodes);
      }
    };
    await Promise.all(procs.map(worker));
  } finally {
    for (const p of procs) p.quit();
  }
  const parityBugCount = outcomes.reduce((a, o) => a + o.parityBugs.length, 0);
  return { outcomes, parityBugCount };
}
