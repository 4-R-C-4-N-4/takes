export * from './types.js';
export * from './expand.js';
export * from './setup.js';
export * from './load.js';
import { r2026_1 } from './rulesets/index.js';
import { rulesetFromJSON } from './load.js';
import type { Ruleset } from './types.js';

export const RULESETS: Record<string, Ruleset> = { '2026.1': rulesetFromJSON(r2026_1) };
export const CURRENT_RULESET_VERSION = '2026.1';
export function getRuleset(version: string): Ruleset | undefined { return RULESETS[version]; }
