import { describe, it, expect } from 'vitest';
import { getRuleset, expandPiece, type Piece, type Ruleset } from '@takes/library';
import { pieceToBetza, componentToBetza, BetzaUnsupported, variantIni, fsfPath, fsfDivideBatch } from './index.js';

const rs = getRuleset('2026.1')!;
const sq = (i: number) => 'abcdefgh'[i % 8]! + String((i >> 3) + 1);

describe('pieceToBetza', () => {
  it('matches the spec Betza column', () => {
    expect(pieceToBetza(rs.pieces.knight!)).toBe('N');
    expect(pieceToBetza(rs.pieces.bishop!)).toBe('B');
    expect(pieceToBetza(rs.pieces.rook!)).toBe('R');
    expect(pieceToBetza(rs.pieces.queen!)).toBe('RB');
    expect(pieceToBetza(rs.pieces.wraith!)).toBe('mRcB');
    expect(pieceToBetza(rs.pieces.lancer!)).toBe('fRbW');
    expect(pieceToBetza(rs.pieces.berolina!)).toBe('mfFcfW');
    expect(pieceToBetza(rs.pieces.warden!)).toBe('sRvW');
    const current = getRuleset('2026.2')!;
    expect(pieceToBetza(current.pieces.toad!)).toBe('DF');
    expect(pieceToBetza(current.pieces.heron!)).toBe('AW');
    expect(pieceToBetza(current.pieces.dragon!)).toBe('RBDA');
  });
  it('limited sliders and rejections', () => {
    // FSF keeps one range per direction and move type: overlapping same-direction terms must be merged.
    expect(pieceToBetza({ id: 'x', name: 'x', glyph: 'Z', tier: 'minor', components: [
      { vec: [0, 1], sym: ['f'], range: 3, path: 'slide', mode: 'move' },
      { vec: [0, 1], sym: ['f', 'b'], range: 2, path: 'slide', mode: 'both' },
    ] })).toBe('mfR3cfR2bR2');
    expect(componentToBetza({ vec: [1, 0], sym: ['f'], range: 3, path: 'slide', mode: 'move' })).toBe('mfR3');
    expect(() => componentToBetza({ vec: [1, 2], sym: 'all', range: Infinity, path: 'slide', mode: 'both' })).toThrow(BetzaUnsupported);
    expect(() => componentToBetza({ vec: [0, 1], sym: ['f'], range: 2, path: 'slide', mode: 'move', cond: 'rank2' })).toThrow(BetzaUnsupported);
  });
});

/** Independent reference movegen for ONE piece on a board of blockers (spec semantics). */
function reference(p: Piece, from: number, enemies: Set<number>, blockers: Set<number>): Set<string> {
  const out = new Set<string>();
  for (const v of expandPiece(p, 'w')) {
    if (v.cond) continue;
    let f = from % 8, r = from >> 3;
    for (let n = 1; n <= (v.range === Infinity ? 8 : v.range); n++) {
      f += v.dx; r += v.dy;
      if (f < 0 || f > 7 || r < 0 || r > 7) break;
      const to = r * 8 + f;
      if (enemies.has(to)) { if (v.mode !== 'move') out.add(sq(from) + sq(to)); break; }
      if (blockers.has(to)) break;
      if (v.mode !== 'capture') out.add(sq(from) + sq(to));
    }
  }
  return out;
}

function reach(p: Piece, from: number): Set<number> {
  const s = new Set<number>();
  for (const v of expandPiece(p, 'w')) {
    let f = from % 8, r = from >> 3;
    for (let n = 1; n <= (v.range === Infinity ? 8 : v.range); n++) {
      f += v.dx; r += v.dy; if (f < 0 || f > 7 || r < 0 || r > 7) break; s.add(r * 8 + f);
    }
  }
  return s;
}
const cheb = (a: number, b: number) => Math.max(Math.abs((a % 8) - (b % 8)), Math.abs((a >> 3) - (b >> 3)));

function fen(pieces: Map<number, string>): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = ''; let e = 0;
    for (let f = 0; f < 8; f++) { const c = pieces.get(r * 8 + f); if (!c) { e++; continue; } if (e) { row += e; e = 0; } row += c; }
    if (e) row += e; rows.push(row);
  }
  return rows.join('/') + ' w - - 0 1';
}

const haveFsf = fsfPath() !== null;
describe.skipIf(!haveFsf)('Betza round-trip vs Fairy-Stockfish (M5)', () => {
  for (const rs of [getRuleset('2026.1')!, getRuleset('2026.2')!]) {
  const testPieces = Object.values(rs.pieces).filter((p) => p.id !== 'pawn');
  for (const p of testPieces) {
    it(`${rs.version} ${p.id}: identical move sets from every square, every blocker ring`, () => {
      const ini = variantIni(rs).replace('king = k', 'king = k\nimmobile = o');
      const variant = ini.slice(1, ini.indexOf(']'));
      const cases: Array<{ fen: string; from: number; want: Set<string>; label: string }> = [];
      for (let from = 0; from < 64; from++) {
        if ((from >> 3) >= (p.tier === 'pawn' ? 6 : 7)) continue;
        const r = reach(p, from);
        const free = [...Array(64).keys()].filter((s) => s !== from && !r.has(s) && cheb(s, from) > 1);
        const wk = free.find((s) => true);
        const bk = free.find((s) => s !== wk && cheb(s, wk!) > 1);
        if (wk === undefined || bk === undefined) continue;
        for (let d = 1; d <= 8; d++) {
          const enemies = new Set<number>();
          for (let s = 0; s < 64; s++) if (s !== wk && s !== bk && s !== from && cheb(s, from) === d) enemies.add(s);
          const board = new Map<number, string>([[from, p.glyph], [wk, 'K'], [bk, 'k']]);
          for (const e of enemies) board.set(e, 'o');
          cases.push({ fen: fen(board), from, want: reference(p, from, enemies, new Set([wk, bk])), label: `${p.id} from ${sq(from)} ring ${d}` });
        }
      }
      const divs = fsfDivideBatch(ini, variant, cases.map((c) => c.fen), 1);
      cases.forEach((c, i) => {
        const got = Object.keys(divs[i]!).filter((u) => u.startsWith(sq(c.from)));
        expect(got.sort(), c.label).toEqual([...c.want].sort());
      });
      expect(cases.length).toBeGreaterThan(100);
    });
  }
  }
});
