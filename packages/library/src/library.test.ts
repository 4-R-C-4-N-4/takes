import { describe, it, expect } from 'vitest';
import { expandPiece, parseSetup, serializeSetup, setupCost, getRuleset, setupSquare, SetupParseError } from './index.js';

const rs = getRuleset('2026.1')!;

describe('expandPiece', () => {
  it('knight has 8 leaps', () => { expect(expandPiece(rs.pieces.knight!, 'w')).toHaveLength(8); });
  it('rook has 4 infinite slides', () => {
    const v = expandPiece(rs.pieces.rook!, 'w');
    expect(v).toHaveLength(4); expect(v.every((x) => x.range === Infinity)).toBe(true);
  });
  it('pawn forward flips for black, files not mirrored', () => {
    const w = expandPiece(rs.pieces.pawn!, 'w'); const b = expandPiece(rs.pieces.pawn!, 'b');
    expect(w.filter((v) => v.mode === 'capture').map((v) => [v.dx, v.dy]).sort()).toEqual([[-1, 1], [1, 1]]);
    expect(b.filter((v) => v.mode === 'capture').map((v) => [v.dx, v.dy]).sort()).toEqual([[-1, -1], [1, -1]]);
    expect(b.find((v) => v.cond === 'rank2')).toMatchObject({ dx: 0, dy: -1, range: 2 });
  });
  it('warden: l/r slides + f/b steps', () => {
    const v = expandPiece(rs.pieces.warden!, 'w').map((x) => `${x.dx},${x.dy},${x.range}`).sort();
    expect(v).toEqual(['-1,0,Infinity', '0,-1,1', '0,1,1', '1,0,Infinity']);
  });
});

describe('setup string', () => {
  it('round-trips vanilla and library examples', () => {
    for (const s of ['2026.1:RNBQKBNR/PPPPPPPP/8', '2026.1:R1BQKB{warden}1/PPPPPPPP/2N2N2']) expect(serializeSetup(parseSetup(s))).toBe(s);
  });
  it('costs 39 for both examples', () => {
    expect(setupCost(parseSetup('2026.1:RNBQKBNR/PPPPPPPP/8'), rs)).toBe(39);
    expect(setupCost(parseSetup('2026.1:R1BQKB{warden}1/PPPPPPPP/2N2N2'), rs)).toBe(39);
  });
  it('rejects bad strings', () => {
    for (const s of ['RNBQKBNR/PPPPPPPP/8', '2026.1:RNBQKBN/PPPPPPPP/8', '2026.1:RNBQKBNR/PPPPPPPP', '2026.1:RNBQKBNZ/PPPPPPPP/8', '2026.1:R{warden/PPPPPPPP/8'])
      expect(() => parseSetup(s)).toThrow(SetupParseError);
  });
  it('maps black rank 1 to rank 8 without mirroring files', () => {
    expect(setupSquare('w', 0, 0)).toBe(0); expect(setupSquare('b', 0, 0)).toBe(56); expect(setupSquare('b', 2, 7)).toBe(47);
  });
});
