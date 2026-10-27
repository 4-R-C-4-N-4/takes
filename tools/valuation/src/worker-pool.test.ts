import { it, expect, vi, beforeEach } from 'vitest';
import { getRuleset } from '@takes/library';
import { classicSetup, str } from './setups.js';
const state = vi.hoisted(() => ({ instances: [] as { quit: ReturnType<typeof vi.fn> }[], failAt: -1 }));
vi.mock('./uci.js', () => ({
  FsfProcess: class {
    index: number;
    quit = vi.fn();
    constructor() { this.index = state.instances.length; state.instances.push(this); }
    async start() { if (this.index === state.failAt) throw new Error('startup failed'); }
    async setVariant() {}
    async newGame() {}
  },
}));
vi.mock('./game-loop.js', () => ({ playGame: vi.fn(async () => ({ result: 0, excluded: false, parityBugs: [], parityBugDetails: [], reason: 'test', plies: 0 })) }));
import { runBatch } from './worker-pool.js';
const r = getRuleset('2026.1')!;
const setup = str(classicSetup(r.version));
const job = { white: setup, black: setup, nodes: 1 };
beforeEach(() => { state.instances = []; state.failAt = -1; });
it('caps FSF workers at eight and quits all owned processes on success', async () => {
  const result = await runBatch(r, Array(10).fill(job), 100);
  expect(state.instances).toHaveLength(8);
  expect(result.outcomes).toHaveLength(10);
  for (const process of state.instances) expect(process.quit).toHaveBeenCalledOnce();
});
it('quits previously started and failed-start processes when pool startup fails', async () => {
  state.failAt = 2;
  await expect(runBatch(r, Array(8).fill(job), 8)).rejects.toThrow('startup failed');
  expect(state.instances).toHaveLength(3);
  for (const process of state.instances) expect(process.quit).toHaveBeenCalledOnce();
});
it('starts no FSF process for an empty batch', async () => {
  expect(await runBatch(r, [], 8)).toEqual({ outcomes: [], parityBugCount: 0 });
  expect(state.instances).toHaveLength(0);
});
