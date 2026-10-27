import { describe, it, expect } from 'vitest';
import { computeCastlingHints } from '../castling.js';
import { getRuleset } from '@takes/library';
import { parseSetup } from '@takes/library';

describe('computeCastlingHints', () => {
  const ruleset = getRuleset('2026.1')!;

  it('finds both rook partners in vanilla setup', () => {
    const setup = parseSetup('2026.1:RNBQKBNR/PPPPPPPP/8');
    const hints = computeCastlingHints(setup, ruleset);
    expect(hints.kingFile).toBe(4);
    expect(hints.kingsidePartnerFile).toBe(7);
    expect(hints.queensidePartnerFile).toBe(0);
  });

  it('finds the rook even past intervening minor pieces', () => {
    const setup = parseSetup('2026.1:RNBQKBNR/PPPPPPPP/8');
    const hints = computeCastlingHints(setup, ruleset);
    expect(hints.kingsidePartnerFile).toBe(7);
  });

  it('finds warden as a rook-tier castling partner', () => {
    const setup = parseSetup('2026.1:R1BQKB{warden}1/PPPPPPPP/2N2N2');
    const hints = computeCastlingHints(setup, ruleset);
    expect(hints.kingFile).toBe(4);
    expect(hints.kingsidePartnerFile).toBe(6);
    expect(hints.queensidePartnerFile).toBe(0);
  });
});
