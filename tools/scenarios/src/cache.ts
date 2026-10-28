/** Resumable results cache under .scenario-cache/ (gitignored), keyed by candidate key + settings
 * [req. 4]. Stores raw per-game results so stage B->C can add games without replaying. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import type { CandidateGameResult } from './scenario-game-loop.js';

export interface CacheSettings {
  stage: 'B' | 'C';
  nodes: number;
  rulesetVersion: string;
  [k: string]: unknown;
}

export function cacheKey(candidateKey: string, settings: CacheSettings): string {
  const h = createHash('sha1').update(JSON.stringify({ candidateKey, settings })).digest('hex').slice(0, 16);
  return `${candidateKey.replace(/[^a-zA-Z0-9_.-]/g, '_')}_${settings.stage}_${h}`;
}

export interface CacheFile {
  key: string;
  settings: CacheSettings;
  results: CandidateGameResult[];
}

export function cachePath(cacheDir: string, key: string): string {
  return `${cacheDir}/${key}.json`;
}

export function loadCache(cacheDir: string, key: string): CacheFile | null {
  const p = cachePath(cacheDir, key);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as CacheFile;
}

export function saveCache(cacheDir: string, file: CacheFile): void {
  const p = cachePath(cacheDir, file.key);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(file));
}

/** Returns how many more games are needed to reach `targetGames`, reusing any cached results. */
export function gamesNeeded(cached: CandidateGameResult[] | undefined, targetGames: number): number {
  return Math.max(0, targetGames - (cached?.length ?? 0));
}
