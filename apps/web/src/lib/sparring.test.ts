import { describe, expect, it } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame, fromFEN } from '@takes/engine';
import { chooseMove } from './sparring.js';
import { sandboxRuleset, sandboxSetup, type Candidate } from './candidates.js';

const r = getRuleset('2026.2')!;

describe('sparring bot', () => {
  it('takes a free queen', () => {
    const g = fromFEN(r, '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
    expect(g.moveToUci(chooseMove(g, { timeMs: 300 })!)).toBe('d2d5');
  });
  it('finds mate in one', () => {
    const g = fromFEN(r, '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    expect(g.moveToUci(chooseMove(g, { timeMs: 500 })!)).toBe('a1a8');
  });
  it('leaves the game exactly as it found it, even when the time budget cuts a search', () => {
    const g = createGame(r, '2026.2:RNBQKBNR/PPPPPPPP/8', '2026.2:RNBQKBNR/PPPPPPPP/8');
    const before = g.toFEN();
    const m = chooseMove(g, { timeMs: 30 });
    expect(m).not.toBeNull();
    expect(g.toFEN()).toBe(before);
  });
  it('plays a candidate sandbox game to the end or 40 plies with only legal moves', () => {
    const c = { piece: { id: 'c', name: 'c', glyph: 'C', tier: 'minor', components: [
      { vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' },
      { vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'capture' },
    ] }, tier: 'minor', betza: 'BcN' } as unknown as Candidate;
    const sr = sandboxRuleset(r, c);
    const g = createGame(sr, sandboxSetup(sr.version, 'minor'), `${sr.version}:RNBQKBNR/PPPPPPPP/8`);
    for (let i = 0; i < 40 && g.status().result === '*'; i++) {
      const m = chooseMove(g, { timeMs: 40 })!;
      expect(g.parseUci(g.moveToUci(m))).not.toBeNull();
      g.make(m);
    }
  });
});
