export * from './types.js';
export * from './expand.js';
export * from './setup.js';
export * from './load.js';
import { r2026_1, r2026_2, r2026_3, r2026_4 } from './rulesets/index.js';
import { rulesetFromJSON } from './load.js';
import type { Ruleset } from './types.js';

export const RULESETS: Record<string, Ruleset> = {
  '2026.1': rulesetFromJSON(r2026_1),
  '2026.2': rulesetFromJSON(r2026_2),
  '2026.3': rulesetFromJSON(r2026_3),
  '2026.4': rulesetFromJSON(r2026_4),
};
export const CURRENT_RULESET_VERSION = '2026.4';
export function getRuleset(version: string): Ruleset | undefined { return RULESETS[version]; }
