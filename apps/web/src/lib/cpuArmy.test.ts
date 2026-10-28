import { describe, it, expect } from 'vitest';
import { opponentArmies, cpuArmyPayload } from './cpuArmy.js';
const player = { name: 'Mine', setup: '2026.3:RNBQKBNR/PPPPPPPP/8' };
const other = { name: 'Other', setup: '2026.3:R1B1KB1R/PPPPPPPP/8' };
describe('CPU armies', () => {
  it('deduplicates saved and seed setups and excludes other versions', () => {
    const options = opponentArmies(player.setup, [player, player, { ...other, setup: '2026.2:x' }]);
    expect(options.filter(p => p.setup === player.setup)).toHaveLength(1);
    expect(options.every(p => p.setup.startsWith('2026.3:'))).toBe(true);
  });
  it('assigns the player and CPU armies to either colour', () => {
    expect(cpuArmyPayload(player, 'w', other.setup, [other])).toEqual({ white: player.setup, black: other.setup, cpu: 'b', cpuArmyName: 'Other' });
    expect(cpuArmyPayload(player, 'b', other.setup, [other])).toEqual({ white: other.setup, black: player.setup, cpu: 'w', cpuArmyName: 'Other' });
  });
  it('mirrors by default and falls back for stale or incompatible choices', () => {
    for (const choice of ['mirror', 'missing', '2026.2:x']) {
      expect(cpuArmyPayload(player, 'b', choice, [{ name: 'Old', setup: '2026.2:x' }]).white).toBe(player.setup);
    }
  });
  it('random avoids the player when possible and handles an empty pool', () => {
    expect(cpuArmyPayload(player, 'w', 'random', [player, other], () => 0).black).toBe(other.setup);
    expect(cpuArmyPayload(player, 'w', 'random', [], () => 0).black).toBe(player.setup);
    expect(cpuArmyPayload(player, 'w', 'random', [player], () => 0).black).toBe(player.setup);
  });
});
