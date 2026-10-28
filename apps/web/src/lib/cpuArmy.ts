import type { Color } from '@takes/library';
import { SEED_PROFILES } from './profiles.js';
import { cpuColorFor } from './sides.js';

export interface ArmyOption { name: string; setup: string }
export const CPU_ARMY_KEY = 'takes.cpuArmy';
const version = (setup: string) => setup.split(':')[0];

export function opponentArmies(player: string, saved: ArmyOption[]): ArmyOption[] {
  const seen = new Set<string>();
  return [...saved, ...SEED_PROFILES].filter(p => {
    if (version(p.setup) !== version(player) || seen.has(p.setup)) return false;
    seen.add(p.setup);
    return true;
  });
}

export function cpuArmyPayload(player: ArmyOption, side: Color, choice: string, options: ArmyOption[], random = Math.random) {
  const compatible = options.filter(p => version(p.setup) === version(player.setup));
  const alternatives = compatible.filter(p => p.setup !== player.setup);
  const pool = alternatives.length ? alternatives : compatible;
  const opponent = choice === 'random'
    ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? player
    : compatible.find(p => p.setup === choice) ?? player;
  return {
    white: side === 'w' ? player.setup : opponent.setup,
    black: side === 'b' ? player.setup : opponent.setup,
    cpu: cpuColorFor(side), cpuArmyName: opponent.name,
  };
}
