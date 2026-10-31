import { describe, expect, it } from 'vitest';
import { getRuleset } from '@takes/library';
import { analyseMate } from './mate.js';

// Controls from orthodox endgame theory: KQ vs K and KR vs K are forced wins, KB vs K and KN vs K
// are draws, a queen cannot force mate without her king, and the Amazon (queen + knight) can.
const r = getRuleset('2026.5')!;

describe('lone-king mate analysis', () => {
  it('queen and rook win with their king; bishop and knight cannot', () => {
    expect(analyseMate(r.pieces.queen!, true).winShare).toBeGreaterThan(0.99);
    expect(analyseMate(r.pieces.rook!, true).winShare).toBeGreaterThan(0.99);
    expect(analyseMate(r.pieces.bishop!, true).winShare).toBe(0);
    expect(analyseMate(r.pieces.knight!, true).winShare).toBe(0);
  }, 120_000);

  it('a queen alone cannot force mate; the Amazon (Bane, RBN) can', () => {
    expect(analyseMate(r.pieces.queen!, false).winShare).toBe(0);
    expect(analyseMate(r.pieces.bane!, false).winShare).toBeGreaterThan(0.9);
  });

  it('known mate lengths: KQ vs K mates within 10, KR vs K within 16', () => {
    expect(analyseMate(r.pieces.queen!, true).longestMate).toBeLessThanOrEqual(10);
    expect(analyseMate(r.pieces.rook!, true).longestMate).toBeLessThanOrEqual(16);
  }, 120_000);
});
