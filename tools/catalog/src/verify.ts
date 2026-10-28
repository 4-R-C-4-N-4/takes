/** FSF Betza round-trip verification [docs/catalog/PLAN.md step 5]. */
import type { Piece } from '@takes/library';
import { fsfPath, fsfDivideBatch } from '@takes/betza';
import { expandPiece } from '@takes/library';

const sq = (i: number) => 'abcdefgh'[i % 8]! + String(Math.floor(i / 8) + 1);

function reference(p: Piece, from: number, enemies: Set<number>, blockers: Set<number>): Set<string> {
  const out = new Set<string>();
  for (const v of expandPiece(p, 'w')) {
    let f = from % 8;
    let r = Math.floor(from / 8);
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
    let f = from % 8;
    let r = Math.floor(from / 8);
    for (let n = 1; n <= (v.range === Infinity ? 8 : v.range); n++) {
      f += v.dx; r += v.dy;
      if (f < 0 || f > 7 || r < 0 || r > 7) break;
      s.add(r * 8 + f);
    }
  }
  return s;
}
const cheb = (a: number, b: number) => Math.max(Math.abs((a % 8) - (b % 8)), Math.abs(Math.floor(a / 8) - Math.floor(b / 8)));

function fenFor(pieces: Map<number, string>): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let e = 0;
    for (let f = 0; f < 8; f++) {
      const c = pieces.get(r * 8 + f);
      if (!c) { e++; continue; }
      if (e) { row += e; e = 0; }
      row += c;
    }
    if (e) row += e;
    rows.push(row);
  }
  return rows.join('/') + ' w - - 0 1';
}

/**
 * One moderate-cost ring-probe per candidate piece (ring distance 3 from the
 * centre of the board), batched FSF-side. Returns true if FSF's destination
 * set from that square matches the reference movegen exactly.
 */
export interface VerifyCase { id: string; betza: string; piece: Piece; from: number; wk: number; bk: number; enemies: Set<number>; want: Set<string> }

export function buildVerifyCase(piece: Piece, betza: string): VerifyCase {
  const from = 27; // d4 — a central square with room on all sides
  const r = reach(piece, from);
  const free = [...Array(64).keys()].filter((s) => s !== from && !r.has(s) && cheb(s, from) > 1);
  const wk = free[0]!;
  const bk = free.find((s) => s !== wk && cheb(s, wk) > 1)!;
  const enemies = new Set<number>();
  for (let s = 0; s < 64; s++) if (s !== wk && s !== bk && s !== from && cheb(s, from) === 3) enemies.add(s);
  return { id: piece.id, betza, piece, from, wk, bk, enemies, want: reference(piece, from, enemies, new Set([wk, bk])) };
}

export interface VerifyResult { id: string; ok: boolean; got?: string[]; want?: string[]; error?: string }

const CHUNK_LETTERS = 'abcdefghijlmnpqrstuvwyz'.split(''); // exclude k (king) and o (immobile blocker)

/** Runs one FSF variant per chunk (max 25 custom piece slots) over all cases in that chunk. */
export function verifyBatch(cases: VerifyCase[], chunkSize = 23): VerifyResult[] {
  if (!fsfPath()) throw new Error('Fairy-Stockfish binary not found');
  const results: VerifyResult[] = [];
  for (let start = 0; start < cases.length; start += chunkSize) {
    const chunk = cases.slice(start, start + chunkSize);
    const letters = chunk.map((_, i) => CHUNK_LETTERS[i]!);
    const lines = ['[probe]', 'king = k', 'immobile = o'];
    chunk.forEach((c, i) => lines.push(`customPiece${i + 1} = ${letters[i]}:${c.betza}`));
    lines.push('castlingRookPieces = -', 'promotionPawnTypes = -', 'promotionPieceTypesWhite = -', 'promotionPieceTypesBlack = -', 'enPassantTypes = -', 'chess960 = true', 'startFen = 4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    const ini = lines.join('\n') + '\n';
    const fens = chunk.map((c, i) => {
      const board = new Map<number, string>([[c.from, letters[i]!.toUpperCase()], [c.wk, 'K'], [c.bk, 'k']]);
      for (const e of c.enemies) board.set(e, 'o');
      return fenFor(board);
    });
    try {
      const divs = fsfDivideBatch(ini, 'probe', fens, 1);
      chunk.forEach((c, i) => {
        const got = Object.keys(divs[i]!).filter((u) => u.startsWith(sq(c.from)));
        const want = [...c.want].sort();
        const gotSorted = got.sort();
        results.push({ id: c.id, ok: JSON.stringify(gotSorted) === JSON.stringify(want), got: gotSorted, want });
      });
    } catch (e) {
      chunk.forEach((c) => results.push({ id: c.id, ok: false, error: String(e) }));
    }
  }
  return results;
}
