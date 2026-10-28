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

/** Returns null when no legal king placement exists outside the piece's reach (an illegal position would let FSF capture a king). */
export function buildVerifyCase(piece: Piece, betza: string, from = 27, ring = 3): VerifyCase | null {
  const r = reach(piece, from);
  const free = [...Array(64).keys()].filter((s) => s !== from && !r.has(s) && cheb(s, from) > Math.max(1, ring));
  const wk = free[0];
  const bk = free.find((s) => s !== wk && cheb(s, wk!) > 1);
  if (wk === undefined || bk === undefined) return null;
  const enemies = new Set<number>();
  for (let s = 0; s < 64; s++) if (s !== wk && s !== bk && s !== from && cheb(s, from) === ring) enemies.add(s);
  return { id: piece.id, betza, piece, from, wk, bk, enemies, want: reference(piece, from, enemies, new Set([wk, bk])) };
}

/** Corners, edges and centre squares at near/mid/far blocker rings: cheap check for EVERY entry. */
export const SMOKE_SQUARES = [0, 7, 3, 24, 27, 36, 31, 50];
export const SMOKE_RINGS = [1, 2, 3];
/** Exhaustive probe: every from-square below rank 8 and every blocker ring (used on a stratified sample). */
export function exhaustiveCases(piece: Piece, betza: string): VerifyCase[] {
  const out: VerifyCase[] = [];
  for (let from = 0; from < 56; from++) for (let ring = 1; ring <= 7; ring++) { const c = buildVerifyCase(piece, betza, from, ring); if (c) out.push(c); }
  return out;
}
export function smokeCases(piece: Piece, betza: string): VerifyCase[] {
  return SMOKE_SQUARES.flatMap((from) => SMOKE_RINGS.map((ring) => buildVerifyCase(piece, betza, from, ring))).filter((c): c is VerifyCase => c !== null);
}

export interface VerifyResult { id: string; ok: boolean; got?: string[]; want?: string[]; error?: string }

const CHUNK_LETTERS = 'abcdefghijlmnpqrstuvwyz'.split(''); // exclude k (king) and o (immobile blocker)

/** Runs one FSF variant per chunk (max 25 custom piece slots) over all cases in that chunk. */
export function verifyBatch(cases: VerifyCase[], chunkSize = 23): VerifyResult[] {
  if (!fsfPath()) throw new Error('Fairy-Stockfish binary not found');
  // Chunk by distinct piece (one custom slot each), so each piece may contribute many positions.
  const byPiece = new Map<string, VerifyCase[]>();
  for (const c of cases) { const a = byPiece.get(c.id) ?? []; a.push(c); byPiece.set(c.id, a); }
  const ids = [...byPiece.keys()];
  const results: VerifyResult[] = [];
  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunkIds = ids.slice(start, start + chunkSize);
    const lines = ['[probe]', 'king = k', 'immobile = o'];
    const letterOf = new Map<string, string>();
    chunkIds.forEach((id, i) => { letterOf.set(id, CHUNK_LETTERS[i]!); lines.push(`customPiece${i + 1} = ${CHUNK_LETTERS[i]}:${byPiece.get(id)![0]!.betza}`); });
    lines.push('castlingRookPieces = -', 'promotionPawnTypes = -', 'promotionPieceTypesWhite = -', 'promotionPieceTypesBlack = -', 'enPassantTypes = -', 'chess960 = true', 'startFen = 4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    const ini = lines.join('\n') + '\n';
    const chunk = chunkIds.flatMap((id) => byPiece.get(id)!);
    const fens = chunk.map((c) => {
      const board = new Map<number, string>([[c.from, letterOf.get(c.id)!.toUpperCase()], [c.wk, 'K'], [c.bk, 'k']]);
      for (const e of c.enemies) board.set(e, 'o');
      return fenFor(board);
    });
    try {
      const divs = fsfDivideBatch(ini, 'probe', fens, 1);
      chunk.forEach((c, i) => {
        const got = Object.keys(divs[i]!).filter((u) => u.startsWith(sq(c.from))).sort();
        const want = [...c.want].sort();
        results.push({ id: c.id, ok: JSON.stringify(got) === JSON.stringify(want), got, want });
      });
    } catch (e) {
      chunk.forEach((c) => results.push({ id: c.id, ok: false, error: String(e) }));
    }
  }
  return results;
}
