import { describe, it, expect } from 'vitest';
import { getRuleset, parseSetup } from '@takes/library';
import { kingSafety, validateProfile } from '../src/index.js';

const rs = getRuleset('2026.1')!;

describe('kingSafety: leapers can never reach across the empty ranks 4-5 gap [spec.md "Library constraint"]', () => {
  it('no library leaper (knight) ever produces a leap exposure, by the |dy|<=2 leap cap', () => {
    // Enemy zone starts at absolute rank 6 (idx 5) at the closest; a king on rank 1 (idx 0) is
    // always |dy| >= 5 away, and every leap component is capped at |dy| <= 2 (D3/spec), so no
    // leaper placed in the enemy zone can ever leap onto the king. This is a structural guarantee,
    // not a per-setup coincidence — exercise it with the king on every file.
    for (const setupStr of [
      '2026.1:RNBQKBNR/PPPPPPPP/8',
      '2026.1:KNBQRBNR/PPPPPPPP/8',
      '2026.1:RNBQRBNK/PPPPPPPP/8',
    ]) {
      const exposures = kingSafety(parseSetup(setupStr), rs, 'w');
      expect(exposures.some((e) => e.kind === 'leap')).toBe(false);
    }
  });
});

describe('kingSafety: warden only steps one square vertically, so it cannot expose a file from the enemy zone', () => {
  it('an enemy warden placed on the king file in the enemy zone (not adjacent) does NOT expose the king', () => {
    // Warden\'s vertical component is range-1 (a single step), unlike its infinite l/r slide, so
    // placed deep in the enemy zone it can never reach down the file to the king.
    const exposures = kingSafety(parseSetup('2026.1:RNBQKBNR/PPPP1PPP/8'), rs, 'w');
    const fileExp = exposures.find((e) => e.kind === 'file' && e.line === 'e-file');
    expect(fileExp).toBeDefined();
    expect(fileExp!.attackers.some((a) => a.pieceId === 'warden')).toBe(false);
    // but lancer (infinite forward slide, both mode) and rook (infinite l/r/f/b) do expose it
    expect(fileExp!.attackers.some((a) => a.pieceId === 'lancer' || a.pieceId === 'rook' || a.pieceId === 'queen')).toBe(true);
  });
});

describe('validateProfile: KING_EXPOSED is silent when own pieces block every line [D14 / spec king safety]', () => {
  it('a fully intact 3-rank back wall has no exposures for any library piece', () => {
    expect(validateProfile('2026.1:R1BQKB{warden}1/PPPPPPPP/2N2N2', rs).some((i) => i.code === 'KING_EXPOSED')).toBe(false);
  });
});
