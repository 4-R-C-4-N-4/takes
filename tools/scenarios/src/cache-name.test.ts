import { expect, it } from 'vitest';
import { cacheKey } from './cache.js';

it('cache file names stay under the filesystem limit and remain unique', () => {
  const long = Array.from({ length: 40 }, (_, i) => `${i},2,1,leap,capture`).join(';');
  const a = cacheKey(long, { stage: 'B', nodes: 3000, rulesetVersion: '2026.2' });
  const b = cacheKey(long + ';9,9,1,leap,capture', { stage: 'B', nodes: 3000, rulesetVersion: '2026.2' });
  expect(a.length + '.json'.length).toBeLessThan(255);
  expect(a).not.toBe(b);
});
