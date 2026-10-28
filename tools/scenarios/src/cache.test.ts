import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheKey, loadCache, saveCache, gamesNeeded, type CacheSettings } from '../src/cache.js';
import type { CandidateGameResult } from '../src/scenario-game-loop.js';

function fakeResult(over: Partial<CandidateGameResult> = {}): CandidateGameResult {
  return {
    result: 1, plies: 40, reason: 'checkmate', parityBugs: [], parityBugDetails: [], excluded: false,
    candidateColor: 'w', candidateMoves: 5, candidateCaptures: 1, candidateChecks: 0, candidateForks: 0,
    candidateAlive: true, finalAttack: false, ...over,
  };
}

describe('cache keying', () => {
  const settingsA: CacheSettings = { stage: 'B', nodes: 3000, rulesetVersion: '2026.2' };
  const settingsB: CacheSettings = { stage: 'C', nodes: 3000, rulesetVersion: '2026.2' };

  it('is deterministic for the same candidate key + settings', () => {
    expect(cacheKey('fixture:a', settingsA)).toBe(cacheKey('fixture:a', settingsA));
  });

  it('differs across stages, settings, or candidate keys', () => {
    expect(cacheKey('fixture:a', settingsA)).not.toBe(cacheKey('fixture:a', settingsB));
    expect(cacheKey('fixture:a', settingsA)).not.toBe(cacheKey('fixture:b', settingsA));
    expect(cacheKey('fixture:a', settingsA)).not.toBe(cacheKey('fixture:a', { ...settingsA, nodes: 4000 }));
  });
});

describe('resumable cache', () => {
  let dir: string;
  const settings: CacheSettings = { stage: 'B', nodes: 3000, rulesetVersion: '2026.2' };

  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('round-trips results through save/load', () => {
    dir = mkdtempSync(join(tmpdir(), 'scn-cache-'));
    const key = cacheKey('fixture:a', settings);
    expect(loadCache(dir, key)).toBeNull();
    const results = [fakeResult(), fakeResult({ result: -1 })];
    saveCache(dir, { key, settings, results });
    const loaded = loadCache(dir, key);
    expect(loaded?.results).toHaveLength(2);
  });

  it('gamesNeeded only requests the shortfall, enabling resumable stage B -> C', () => {
    expect(gamesNeeded(undefined, 40)).toBe(40);
    expect(gamesNeeded([fakeResult(), fakeResult()], 40)).toBe(38);
    expect(gamesNeeded(new Array(160).fill(fakeResult()), 40)).toBe(0);
  });
});
