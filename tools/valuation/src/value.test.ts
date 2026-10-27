import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRuleset, parseSetup } from '@takes/library';
import type { GameJob } from './worker-pool.js';
import type { GameOutcome } from './game-loop.js';
vi.mock('./worker-pool.js', () => ({ runBatch: vi.fn() }));
import { runBatch } from './worker-pool.js';
import { valuePiece, runCalibration } from './value.js';
const r = getRuleset('2026.1')!;
const outcome = (result: -1 | 0 | 1, excluded = false): GameOutcome => ({ result, excluded, plies: 1, reason: 'test', parityBugs: excluded ? ['illegal'] : [], parityBugDetails: [] });

describe('reported measurement versus search feedback', () => {
  it('fits signed White scores rather than folding both signs into favored-side scores', async () => {
    const values: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
    const material = (setup: string) => parseSetup(setup).ranks.flat().reduce<number>((sum, id) => sum + (id ? values[id]! : 0), 0);
    vi.mocked(runBatch).mockImplementation(async (_rules, jobs) => ({ outcomes: jobs.map((job) => outcome(material(job.white) > material(job.black) ? 1 : -1)), parityBugCount: 0 }));
    const calibration = await runCalibration(r, 1, 1, 4);
    expect(calibration.fit.b).toBeGreaterThan(0.1);
    expect(calibration.fit.a).toBeCloseTo(0, 5);
    expect(calibration.signedBuckets.find((b) => b.deltaPawns === -14)!.losses).toBe(2);
    expect(calibration.signedBuckets.find((b) => b.deltaPawns === 14)!.wins).toBe(2);
    expect(calibration.range).toEqual({ lo: -14, hi: 14 });
  });

  it('logs actual random-game setups for excluded illegal moves', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'valuation-log-test-'));
    const log = join(directory, 'parity.jsonl');
    const seen: GameJob[][] = [];
    vi.mocked(runBatch).mockImplementation(async (_rules, jobs) => {
      seen.push(jobs);
      const outcomes = jobs.map(() => outcome(0));
      outcomes[0] = { ...outcome(0, true), parityBugDetails: [{ fenBefore: 'test-fen', fsfMove: 'a1a1', engineLegalMoves: ['e2e4'] }] };
      return { outcomes, parityBugCount: 1 };
    });
    try {
      const data = await valuePiece(r, { piece: 'bishop', games: 8, nodes: 1, workers: 1, seed: 1, maxIterations: 1, parityBugLog: log, calibration: { calibration: [], fit: { a: 0, b: 1 }, range: { lo: -14, hi: 14 }, parityBugs: 0, excludedGames: 0 } });
      const records = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      expect(records).toHaveLength(2);
      expect(records[1].setups).toEqual({ white: seen[1]![0]!.white, black: seen[1]![0]!.black });
      expect(records[1].fsf_move).toBe('a1a1');
      expect(data.result.iterations[0]!.draws).toBe(6);
      expect(data.result.iterations[0]!.excludedGames).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps the undamped point with its interval and excludes parity failures', async () => {
    let batch = 0;
    vi.mocked(runBatch).mockImplementation(async (_rules, jobs) => {
      const outcomes = jobs.map((_, i) => {
        // Iteration 0 wins; iteration 1 mostly draws. Orient to target color.
        const target = batch < 2 ? 1 : (i < 4 ? 0 : -1);
        return outcome((i % 2 ? -target : target) as -1 | 0 | 1, i === 0);
      });
      batch++;
      return { outcomes, parityBugCount: 1 };
    });
    const { result } = await valuePiece(r, { piece: 'bishop', games: 20, nodes: 1, workers: 1, seed: 1, maxIterations: 2, calibration: { calibration: [], fit: { a: 0, b: 1 }, range: { lo: -14, hi: 14 }, parityBugs: 0, excludedGames: 0 } });
    expect(result.iterations).toHaveLength(2);
    const [first, last] = result.iterations;
    expect(last!.estimate).not.toBe(last!.feedbackEstimate);
    expect(last!.feedbackEstimate).toBeCloseTo((first!.feedbackEstimate + last!.estimate) / 2);
    expect(result.finalEstimate).toBe(last!.estimate);
    expect(result.finalFeedbackEstimate).toBe(last!.feedbackEstimate);
    expect(last!.lo).toBeLessThanOrEqual(last!.estimate);
    expect(last!.hi).toBeGreaterThanOrEqual(last!.estimate);
    for (const iteration of result.iterations) {
      expect(iteration.games).toBe(18);
      expect(iteration.wins + iteration.draws + iteration.losses).toBe(18);
      expect(iteration.excludedGames).toBe(2);
    }
  });
  it('uses pawn references and divides the total material delta by copy count', async () => {
    const seen: GameJob[] = [];
    vi.mocked(runBatch).mockImplementation(async (_rules, jobs) => {
      seen.push(...jobs);
      return { outcomes: jobs.map((_, i) => outcome(i % 2 ? -1 : 1)), parityBugCount: 0 };
    });
    const { result } = await valuePiece(r, { piece: 'berolina', slot: 'pawn', sameTierCount: 2, games: 8, nodes: 1, workers: 1, seed: 1, maxIterations: 1, calibration: { calibration: [], fit: { a: 0, b: 1 }, range: { lo: -2, hi: 2 }, parityBugs: 0, excludedGames: 0 } });
    expect(result.referenceId).toBe('pawn');
    expect(result.finalEstimate).toBe(2); // 1 + capped total delta 2 / 2 copies
    expect(parseSetup(seen[0]!.white).ranks.flat().filter((id) => id === 'berolina')).toHaveLength(2);
    // Random games are the same sampled profile, swapped, in consecutive pairs.
    expect(seen[4]!.white).toBe(seen[5]!.black);
    expect(seen[4]!.black).toBe(seen[5]!.white);
  });
});
