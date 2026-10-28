import { describe, expect, it } from 'vitest';
import { getRuleset } from '@takes/library';
import { fromFEN } from '../src/index.js';

const r = getRuleset('2026.2')!;
const from = (fen: string, sq: string) => fromFEN(r, fen).legalMoves().map((m) => fromFEN(r, fen).moveToUci(m)).filter((u) => u.startsWith(sq)).sort();

describe('2026.2 hopping pieces', () => {
  it('dragon hops one adjacent blocker but cannot ride past it', () => {
    const moves = from('4k3/8/8/3p4/3P4/2PDP3/3P4/4K3 w - - 0 1', 'd3');
    expect(moves).toEqual(expect.arrayContaining(['d3d5', 'd3b3', 'd3f3', 'd3d1', 'd3b5', 'd3f5', 'd3b1', 'd3f1']));
    expect(moves).not.toContain('d3d6');
    expect(moves).not.toContain('d3a3');
  });
  it('toad captures by orthogonal leap over a screen', () => {
    expect(from('4k3/8/8/4n3/4P3/4T3/8/4K3 w - - 0 1', 'e3')).toContain('e3e5');
  });
  it('heron captures by diagonal leap over a screen', () => {
    expect(from('4k3/8/8/6n1/5P2/4H3/8/4K3 w - - 0 1', 'e3')).toContain('e3g5');
  });
});
