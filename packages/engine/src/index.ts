/**
 * Takes engine — public API CONTRACT. Pure, deterministic, no I/O, no randomness, no UI imports.
 * Other packages (web, server, tools) code against exactly these exports. Do not change signatures
 * without updating docs/PROGRESS.md "Contracts".
 */
import type { Color, Ruleset, Vector } from '@takes/library';
import { expandPiece, parseSetup, setupSquare, KING_ID, VANILLA_PAWN_ID } from '@takes/library';

export type Square = number; // 0..63, a1=0, h8=63, file = sq % 8, rank = sq >> 3

export interface BoardPiece { pieceId: string; color: Color; hasMoved: boolean }

export type MoveKind = 'normal' | 'double' | 'ep' | 'castle';
export interface Move {
  from: Square;
  /** For castling: the PARTNER's square (UCI 960 king-takes-rook convention). */
  to: Square;
  kind: MoveKind;
  /** Promotion target pieceId, if any. */
  promo?: string;
  /** Captured pieceId, if any (filled by movegen). */
  captured?: string;
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
export type EndReason = 'checkmate' | 'stalemate' | 'repetition' | 'move-cap' | 'insufficient' | 'resign' | 'agreement' | 'timeout' | 'abandon';
export interface Status { result: GameResult; reason?: EndReason; inCheck: boolean }

export interface Game {
  readonly ruleset: Ruleset;
  board(): ReadonlyArray<BoardPiece | null>;
  sideToMove(): Color;
  ply(): number;
  legalMoves(): Move[];
  /** Applies a legal move (caller must pass one returned by legalMoves / parseUci). */
  make(m: Move): void;
  unmake(): void;
  isAttacked(sq: Square, by: Color): boolean;
  inCheck(): boolean;
  /** Game-end status by board rules (checkmate/stalemate/repetition/move-cap/insufficient). */
  status(): Status;
  /** Zobrist hash as a hex string (side, castling, ep included). */
  hash(): string;
  /** Promotion targets per color for this game [D6]. */
  promotionTargets(color: Color): string[];
  toFEN(): string;
  moveToUci(m: Move): string;
  /** Returns the matching LEGAL move or null. */
  parseUci(uci: string): Move | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const FILES = 'abcdefgh';
const KING_GLYPH = 'K';

function fileOf(sqv: Square): number { return sqv % 8; }
function rankOf(sqv: Square): number { return sqv >> 3; }
function sq(file: number, rank: number): Square { return rank * 8 + file; }
function inBounds(file: number, rank: number): boolean { return file >= 0 && file < 8 && rank >= 0 && rank < 8; }
function otherColor(c: Color): Color { return c === 'w' ? 'b' : 'w'; }
function squareName(s: Square): string { return `${FILES[fileOf(s)]}${rankOf(s) + 1}`; }
function parseSquareName(s: string): Square {
  const file = FILES.indexOf(s[0]!);
  const rank = Number(s[1]) - 1;
  return sq(file, rank);
}

// Relative-rank helpers: "relative rank 2" etc from the piece's own color POV.
function relRank(s: Square, color: Color): number {
  const r = rankOf(s);
  return color === 'w' ? r + 1 : 8 - r;
}

// ---------------------------------------------------------------------------
// Zobrist (deterministic splitmix64-derived PRNG, keyed by string)
// ---------------------------------------------------------------------------

function splitmix64Next(state: bigint): [bigint, bigint] {
  const MASK = (1n << 64n) - 1n;
  let z = (state + 0x9e3779b97f4a7c15n) & MASK;
  const newState = z;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  z = z ^ (z >> 31n);
  return [z, newState];
}

function hashSeedFromString(s: string): bigint {
  // FNV-1a 64-bit over the string, deterministic.
  let h = 0xcbf29ce484222325n;
  const MASK = (1n << 64n) - 1n;
  for (let i = 0; i < s.length; i++) {
    h = h ^ BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & MASK;
  }
  return h;
}

function keyFromSeed(seed: bigint): bigint {
  const [z] = splitmix64Next(seed);
  return z;
}

class Zobrist {
  private pieceKeys = new Map<string, bigint>(); // key: pieceId|color|square
  private sideKey: bigint;
  private castleKeys = new Map<number, bigint>(); // keyed by right-square index
  private epKeys = new Map<number, bigint>(); // keyed by file 0..7

  constructor() {
    this.sideKey = keyFromSeed(hashSeedFromString('takes-zobrist-side'));
    for (let f = 0; f < 8; f++) {
      this.epKeys.set(f, keyFromSeed(hashSeedFromString(`takes-zobrist-ep-${f}`)));
    }
  }

  pieceKey(pieceId: string, color: Color, square: Square): bigint {
    const k = `${pieceId}|${color}|${square}`;
    let v = this.pieceKeys.get(k);
    if (v === undefined) {
      v = keyFromSeed(hashSeedFromString(`takes-zobrist-piece-${k}`));
      this.pieceKeys.set(k, v);
    }
    return v;
  }

  castleKey(square: Square): bigint {
    let v = this.castleKeys.get(square);
    if (v === undefined) {
      v = keyFromSeed(hashSeedFromString(`takes-zobrist-castle-${square}`));
      this.castleKeys.set(square, v);
    }
    return v;
  }

  epKey(file: number): bigint {
    return this.epKeys.get(file)!;
  }

  sideKeyValue(): bigint { return this.sideKey; }
}

// Singleton zobrist tables shared by all games (deterministic, pure).
const ZOBRIST = new Zobrist();

// ---------------------------------------------------------------------------
// Castling rights
// ---------------------------------------------------------------------------

interface CastleRight {
  kingStart: Square;
  partnerStart: Square; // rook-tier piece start square
  side: 'king' | 'queen'; // kingside = toward h-file, queenside = toward a-file
}

interface GameState {
  board: (BoardPiece | null)[];
  sideToMove: Color;
  ply: number;
  castleRights: { w: CastleRight[]; b: CastleRight[] };
  epSquare: Square | null; // square the pawn skipped over, available for ep capture this move only
  halfmoveClock: number;
}

interface UndoEntry {
  move: Move;
  captured: BoardPiece | null;
  capturedSquare: Square | null;
  prevEpSquare: Square | null;
  prevHalfmove: number;
  prevHash: bigint;
  movedHadMoved: boolean;
  removedCastleRights: { color: Color; right: CastleRight }[];
  promoFrom?: string; // piece id before promotion (for unmake)
}

// ---------------------------------------------------------------------------
// GameImpl
// ---------------------------------------------------------------------------

class GameImpl implements Game {
  readonly ruleset: Ruleset;
  private state: GameState;
  private history: UndoEntry[] = [];
  private currentHash: bigint;
  private positionCounts = new Map<string, number>();
  private startPromotionTargets: { w: string[]; b: string[] };
  private vectorCache = new Map<string, Vector[]>();

  constructor(ruleset: Ruleset, board: (BoardPiece | null)[], sideToMove: Color, castleRights: { w: CastleRight[]; b: CastleRight[] }, epSquare: Square | null, halfmoveClock: number, ply: number) {
    this.ruleset = ruleset;
    this.state = { board, sideToMove, ply, castleRights, epSquare, halfmoveClock };
    this.startPromotionTargets = this.computeStartPromotionTargets();
    this.currentHash = this.computeHashFromScratch();
    this.recordPosition();
  }

  private getVectors(pieceId: string, color: Color): Vector[] {
    const k = `${pieceId}|${color}`;
    let v = this.vectorCache.get(k);
    if (v) return v;
    if (pieceId === KING_ID) {
      v = KING_VECTORS;
    } else {
      const piece = this.ruleset.pieces[pieceId];
      if (!piece) throw new Error(`unknown piece id '${pieceId}'`);
      v = expandPiece(piece, color);
    }
    this.vectorCache.set(k, v);
    return v;
  }

  private computeStartPromotionTargets(): { w: string[]; b: string[] } {
    const compute = (color: Color): string[] => {
      if (this.ruleset.promotionMode === 'list') return [...this.ruleset.promotionTargets];
      const ids = new Set<string>();
      for (const bp of this.state.board) {
        if (bp && bp.color === color && bp.pieceId !== KING_ID) {
          const piece = this.ruleset.pieces[bp.pieceId];
          if (piece && piece.tier !== 'pawn') ids.add(bp.pieceId);
        }
      }
      if (ids.size === 0) return [...this.ruleset.promotionFallback];
      return [...ids];
    };
    return { w: compute('w'), b: compute('b') };
  }

  promotionTargets(color: Color): string[] {
    return color === 'w' ? [...this.startPromotionTargets.w] : [...this.startPromotionTargets.b];
  }

  board(): ReadonlyArray<BoardPiece | null> { return this.state.board; }
  sideToMove(): Color { return this.state.sideToMove; }
  ply(): number { return this.state.ply; }

  private computeHashFromScratch(): bigint {
    let h = 0n;
    for (let s = 0; s < 64; s++) {
      const bp = this.state.board[s];
      if (bp) h ^= ZOBRIST.pieceKey(bp.pieceId, bp.color, s);
    }
    if (this.state.sideToMove === 'b') h ^= ZOBRIST.sideKeyValue();
    for (const color of ['w', 'b'] as Color[]) {
      for (const r of this.state.castleRights[color]) h ^= ZOBRIST.castleKey(r.partnerStart);
    }
    if (this.state.epSquare !== null) h ^= ZOBRIST.epKey(fileOf(this.state.epSquare));
    return h;
  }

  hash(): string { return this.currentHash.toString(16); }

  private positionKey(): string { return this.currentHash.toString(16); }

  private recordPosition(): void {
    const k = this.positionKey();
    this.positionCounts.set(k, (this.positionCounts.get(k) ?? 0) + 1);
  }

  private unrecordPosition(): void {
    const k = this.positionKey();
    const c = this.positionCounts.get(k) ?? 1;
    if (c <= 1) this.positionCounts.delete(k); else this.positionCounts.set(k, c - 1);
  }

  isAttacked(target: Square, by: Color): boolean {
    const b = this.state.board;
    for (let s = 0; s < 64; s++) {
      const bp = b[s];
      if (!bp || bp.color !== by) continue;
      const vectors = this.getVectors(bp.pieceId, by);
      const df = fileOf(target) - fileOf(s);
      const dr = rankOf(target) - rankOf(s);
      for (const v of vectors) {
        if (v.mode === 'move') continue; // only capture-capable vectors
        if (v.path === 'leap') {
          if (v.dx === df && v.dy === dr) return true;
          continue;
        }
        if (v.dx === 0 && v.dy === 0) continue;
        let steps: number | null = null;
        if (v.dx !== 0 && v.dy !== 0) {
          if (df % v.dx !== 0 || dr % v.dy !== 0) continue;
          const s1 = df / v.dx, s2 = dr / v.dy;
          if (s1 !== s2) continue;
          steps = s1;
        } else if (v.dx !== 0) {
          if (dr !== 0 || df % v.dx !== 0) continue;
          steps = df / v.dx;
        } else {
          if (df !== 0 || dr % v.dy !== 0) continue;
          steps = dr / v.dy;
        }
        if (steps === null || !Number.isInteger(steps) || steps <= 0 || steps > v.range) continue;
        let blocked = false;
        for (let st = 1; st < steps; st++) {
          const f = fileOf(s) + v.dx * st;
          const r = rankOf(s) + v.dy * st;
          if (b[sq(f, r)]) { blocked = true; break; }
        }
        if (!blocked) return true;
      }
    }
    return false;
  }

  private findKing(color: Color): Square {
    for (let s = 0; s < 64; s++) {
      const bp = this.state.board[s];
      if (bp && bp.color === color && bp.pieceId === KING_ID) return s;
    }
    throw new Error('king not found');
  }

  inCheck(): boolean {
    const color = this.state.sideToMove;
    return this.isAttacked(this.findKing(color), otherColor(color));
  }

  private pseudoMovesFor(s: Square): Move[] {
    const bp = this.state.board[s]!;
    const color = bp.color;
    const moves: Move[] = [];
    const vectors = this.getVectors(bp.pieceId, color);
    const seen = new Set<string>();
    const b = this.state.board;
    const isPawnTier = bp.pieceId !== KING_ID && this.ruleset.pieces[bp.pieceId]?.tier === 'pawn';

    for (const v of vectors) {
      if (v.cond === 'rank2') {
        if (bp.hasMoved) continue;
        if (relRank(s, color) !== 2) continue;
      }
      if (v.path === 'leap') {
        const f = fileOf(s) + v.dx;
        const r = rankOf(s) + v.dy;
        if (!inBounds(f, r)) continue;
        const dest = sq(f, r);
        const occ = b[dest];
        if (occ) {
          if (occ.color === color) continue;
          if (v.mode === 'move') continue;
        } else {
          if (v.mode === 'capture') continue;
        }
        this.addMoveCandidate(moves, seen, s, dest, bp, isPawnTier, color);
      } else {
        for (let st = 1; st <= v.range; st++) {
          const f = fileOf(s) + v.dx * st;
          const r = rankOf(s) + v.dy * st;
          if (!inBounds(f, r)) break;
          const dest = sq(f, r);
          const occ = b[dest];
          if (occ) {
            if (occ.color !== color && v.mode !== 'move') {
              this.addMoveCandidate(moves, seen, s, dest, bp, isPawnTier, color);
            }
            break; // blocked either way
          } else {
            if (v.mode !== 'capture') {
              this.addMoveCandidate(moves, seen, s, dest, bp, isPawnTier, color);
            }
            // capture-only slide onto empty square: not a valid landing, keep scanning
          }
        }
      }
    }

    // en passant
    if (bp.pieceId === VANILLA_PAWN_ID && this.state.epSquare !== null) {
      const ep = this.state.epSquare;
      const dr = color === 'w' ? 1 : -1;
      if (rankOf(ep) === rankOf(s) + dr && Math.abs(fileOf(ep) - fileOf(s)) === 1) {
        const capSq = sq(fileOf(ep), rankOf(s));
        const capBp = b[capSq];
        if (capBp && capBp.pieceId === VANILLA_PAWN_ID && capBp.color !== color) {
          moves.push({ from: s, to: ep, kind: 'ep', captured: VANILLA_PAWN_ID });
        }
      }
    }

    // castling
    if (bp.pieceId === KING_ID && !bp.hasMoved) {
      for (const right of this.state.castleRights[color]) {
        if (right.kingStart !== s) continue;
        const partnerBp = b[right.partnerStart];
        if (!partnerBp) continue;
        if (partnerBp.hasMoved) continue;
        const kingFile = fileOf(s);
        const partnerFile = fileOf(right.partnerStart);
        const rank = rankOf(s);
        const side: 'king' | 'queen' = partnerFile > kingFile ? 'king' : 'queen';
        const kingDestFile = side === 'king' ? 6 : 2;
        const partnerDestFile = side === 'king' ? 5 : 3;

        const involved = new Set([s, right.partnerStart]);
        const touched = new Set<number>();
        const addRange = (a: number, bnd: number) => {
          const lo = Math.min(a, bnd), hi = Math.max(a, bnd);
          for (let f = lo; f <= hi; f++) touched.add(f);
        };
        addRange(kingFile, kingDestFile);
        addRange(partnerFile, partnerDestFile);
        let pathOk = true;
        for (const f of touched) {
          const sqr = sq(f, rank);
          if (involved.has(sqr)) continue;
          if (b[sqr]) { pathOk = false; break; }
        }
        if (!pathOk) continue;

        const opp = otherColor(color);
        if (this.isAttacked(s, opp)) continue;
        let kingPathOk = true;
        const lo = Math.min(kingFile, kingDestFile), hi = Math.max(kingFile, kingDestFile);
        for (let f = lo; f <= hi; f++) {
          if (f === kingFile) continue;
          if (this.isAttackedHypothetical(sq(f, rank), opp, s, right.partnerStart)) { kingPathOk = false; break; }
        }
        if (!kingPathOk) continue;

        moves.push({ from: s, to: right.partnerStart, kind: 'castle' });
      }
    }

    return moves;
  }

  private isAttackedHypothetical(target: Square, by: Color, vacate1: Square, vacate2: Square): boolean {
    const b = this.state.board;
    const save1 = b[vacate1];
    const save2 = b[vacate2];
    b[vacate1] = null;
    if (vacate2 !== vacate1) b[vacate2] = null;
    const result = this.isAttacked(target, by);
    b[vacate1] = save1 ?? null;
    if (vacate2 !== vacate1) b[vacate2] = save2 ?? null;
    return result;
  }

  private addMoveCandidate(moves: Move[], seen: Set<string>, from: Square, dest: Square, bp: BoardPiece, isPawnTier: boolean, color: Color): void {
    const destRelRank = relRank(dest, color);
    const mustPromote = isPawnTier && destRelRank === 8;
    const captured = this.state.board[dest]?.pieceId;
    if (mustPromote) {
      const targets = this.promotionTargets(color);
      for (const t of targets) {
        const key = `${from},${dest},${t}`;
        if (seen.has(key)) continue;
        seen.add(key);
        moves.push({ from, to: dest, kind: 'normal', promo: t, captured });
      }
    } else {
      let kind: MoveKind = 'normal';
      if (bp.pieceId === VANILLA_PAWN_ID && Math.abs(rankOf(dest) - rankOf(from)) === 2) kind = 'double';
      const key = `${from},${dest},`;
      if (seen.has(key)) return;
      seen.add(key);
      moves.push({ from, to: dest, kind, captured });
    }
  }

  legalMoves(): Move[] {
    const color = this.state.sideToMove;
    const out: Move[] = [];
    const squares: Square[] = [];
    for (let s = 0; s < 64; s++) {
      const bp = this.state.board[s];
      if (bp && bp.color === color) squares.push(s);
    }
    for (const s of squares) {
      const pseudo = this.pseudoMovesFor(s);
      for (const m of pseudo) {
        this.make(m);
        const legal = !this.isAttacked(this.findKing(color), otherColor(color));
        this.unmake();
        if (legal) out.push(m);
      }
    }
    return out;
  }

  make(m: Move): void {
    const b = this.state.board;
    const color = this.state.sideToMove;
    const piece = b[m.from];
    if (!piece) throw new Error('no piece at from square');
    const removedCastleRights: { color: Color; right: CastleRight }[] = [];
    let captured: BoardPiece | null = null;
    let capturedSquare: Square | null = null;
    const prevEp = this.state.epSquare;
    const prevHalfmove = this.state.halfmoveClock;
    const prevHash = this.currentHash;
    const movedHadMoved = piece.hasMoved;
    let promoFrom: string | undefined;
    let newEp: Square | null = null;

    if (m.kind === 'castle') {
      const partnerBp = b[m.to]!;
      const kingFrom = m.from;
      const partnerFrom = m.to;
      const rank = rankOf(kingFrom);
      const kingFile = fileOf(kingFrom);
      const partnerFile = fileOf(partnerFrom);
      const side: 'king' | 'queen' = partnerFile > kingFile ? 'king' : 'queen';
      const kingDestFile = side === 'king' ? 6 : 2;
      const partnerDestFile = side === 'king' ? 5 : 3;
      const kingDest = sq(kingDestFile, rank);
      const partnerDest = sq(partnerDestFile, rank);

      this.currentHash ^= ZOBRIST.pieceKey(piece.pieceId, color, kingFrom);
      this.currentHash ^= ZOBRIST.pieceKey(partnerBp.pieceId, color, partnerFrom);
      b[kingFrom] = null;
      b[partnerFrom] = null;
      b[kingDest] = { pieceId: piece.pieceId, color, hasMoved: true };
      b[partnerDest] = { pieceId: partnerBp.pieceId, color, hasMoved: true };
      this.currentHash ^= ZOBRIST.pieceKey(piece.pieceId, color, kingDest);
      this.currentHash ^= ZOBRIST.pieceKey(partnerBp.pieceId, color, partnerDest);

      for (const r of this.state.castleRights[color]) {
        this.currentHash ^= ZOBRIST.castleKey(r.partnerStart);
        removedCastleRights.push({ color, right: r });
      }
      this.state.castleRights[color] = [];
    } else if (m.kind === 'ep') {
      const dr = color === 'w' ? -1 : 1;
      capturedSquare = sq(fileOf(m.to), rankOf(m.to) + dr);
      captured = b[capturedSquare] ?? null;
      if (captured) this.currentHash ^= ZOBRIST.pieceKey(captured.pieceId, captured.color, capturedSquare);
      b[capturedSquare] = null;
      this.currentHash ^= ZOBRIST.pieceKey(piece.pieceId, color, m.from);
      b[m.from] = null;
      b[m.to] = { pieceId: piece.pieceId, color, hasMoved: true };
      this.currentHash ^= ZOBRIST.pieceKey(piece.pieceId, color, m.to);
    } else {
      if (b[m.to]) {
        captured = b[m.to] ?? null;
        capturedSquare = m.to;
        this.currentHash ^= ZOBRIST.pieceKey(captured!.pieceId, captured!.color, m.to);
      }
      this.currentHash ^= ZOBRIST.pieceKey(piece.pieceId, color, m.from);
      b[m.from] = null;
      const finalPieceId = m.promo ?? piece.pieceId;
      if (m.promo) promoFrom = piece.pieceId;
      b[m.to] = { pieceId: finalPieceId, color, hasMoved: true };
      this.currentHash ^= ZOBRIST.pieceKey(finalPieceId, color, m.to);
      if (m.kind === 'double') {
        newEp = sq(fileOf(m.from), (rankOf(m.from) + rankOf(m.to)) / 2);
      }
    }

    if (captured && capturedSquare !== null) {
      const oppColor = captured.color;
      const remaining: CastleRight[] = [];
      for (const r of this.state.castleRights[oppColor]) {
        if (r.partnerStart === capturedSquare) {
          this.currentHash ^= ZOBRIST.castleKey(r.partnerStart);
          removedCastleRights.push({ color: oppColor, right: r });
        } else remaining.push(r);
      }
      this.state.castleRights[oppColor] = remaining;
    }

    if (m.kind !== 'castle') {
      const remaining: CastleRight[] = [];
      for (const r of this.state.castleRights[color]) {
        if (r.kingStart === m.from || r.partnerStart === m.from) {
          this.currentHash ^= ZOBRIST.castleKey(r.partnerStart);
          removedCastleRights.push({ color, right: r });
        } else remaining.push(r);
      }
      this.state.castleRights[color] = remaining;
    }

    if (prevEp !== null) this.currentHash ^= ZOBRIST.epKey(fileOf(prevEp));
    if (newEp !== null) this.currentHash ^= ZOBRIST.epKey(fileOf(newEp));
    this.state.epSquare = newEp;

    const isPawnMove = this.ruleset.pieces[piece.pieceId]?.tier === 'pawn' || piece.pieceId === VANILLA_PAWN_ID;
    this.state.halfmoveClock = (isPawnMove || captured) ? 0 : prevHalfmove + 1;

    this.currentHash ^= ZOBRIST.sideKeyValue();
    this.state.sideToMove = otherColor(color);
    this.state.ply += 1;

    this.history.push({
      move: m, captured, capturedSquare, prevEpSquare: prevEp, prevHalfmove, prevHash,
      movedHadMoved, removedCastleRights, promoFrom,
    });
    this.recordPosition();
  }

  unmake(): void {
    const entry = this.history.pop();
    if (!entry) throw new Error('nothing to unmake');
    this.unrecordPosition();
    const b = this.state.board;
    const m = entry.move;
    this.state.sideToMove = otherColor(this.state.sideToMove);
    const color = this.state.sideToMove;
    this.state.ply -= 1;
    this.state.halfmoveClock = entry.prevHalfmove;
    this.state.epSquare = entry.prevEpSquare;

    if (m.kind === 'castle') {
      const rank = rankOf(m.from);
      const kingFile = fileOf(m.from);
      const partnerFile = fileOf(m.to);
      const side: 'king' | 'queen' = partnerFile > kingFile ? 'king' : 'queen';
      const kingDestFile = side === 'king' ? 6 : 2;
      const partnerDestFile = side === 'king' ? 5 : 3;
      const kingDest = sq(kingDestFile, rank);
      const partnerDest = sq(partnerDestFile, rank);
      const kingBp = b[kingDest]!;
      const partnerBp = b[partnerDest]!;
      b[kingDest] = null;
      b[partnerDest] = null;
      b[m.from] = { pieceId: kingBp.pieceId, color, hasMoved: entry.movedHadMoved };
      b[m.to] = { pieceId: partnerBp.pieceId, color, hasMoved: false };
    } else if (m.kind === 'ep') {
      const bp = b[m.to]!;
      b[m.to] = null;
      b[m.from] = { pieceId: bp.pieceId, color, hasMoved: entry.movedHadMoved };
      if (entry.capturedSquare !== null && entry.captured) {
        b[entry.capturedSquare] = entry.captured;
      }
    } else {
      const bp = b[m.to]!;
      const pieceId = entry.promoFrom ?? bp.pieceId;
      b[m.to] = entry.captured ?? null;
      b[m.from] = { pieceId, color, hasMoved: entry.movedHadMoved };
    }

    for (const removed of entry.removedCastleRights) {
      this.state.castleRights[removed.color].push(removed.right);
    }

    this.currentHash = entry.prevHash;
  }

  status(): Status {
    const color = this.state.sideToMove;
    const inCheck = this.inCheck();
    const hasMoves = this.legalMoves().length > 0;
    if (!hasMoves) {
      if (inCheck) return { result: color === 'w' ? '0-1' : '1-0', reason: 'checkmate', inCheck };
      return { result: '1/2-1/2', reason: 'stalemate', inCheck };
    }
    const key = this.positionKey();
    if ((this.positionCounts.get(key) ?? 0) >= 3) {
      return { result: '1/2-1/2', reason: 'repetition', inCheck };
    }
    if (this.state.ply >= this.ruleset.maxPlies) {
      return { result: '1/2-1/2', reason: 'move-cap', inCheck };
    }
    const nonKing = this.state.board.filter((bp) => bp && bp.pieceId !== KING_ID);
    if (nonKing.length === 0) {
      return { result: '1/2-1/2', reason: 'insufficient', inCheck };
    }
    return { result: '*', inCheck };
  }

  toFEN(): string {
    const b = this.state.board;
    const rows: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let row = '';
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const bp = b[sq(f, r)];
        if (!bp) { empty++; continue; }
        if (empty) { row += String(empty); empty = 0; }
        const glyph = bp.pieceId === KING_ID ? KING_GLYPH : this.ruleset.pieces[bp.pieceId]!.glyph;
        row += bp.color === 'w' ? glyph.toUpperCase() : glyph.toLowerCase();
      }
      if (empty) row += String(empty);
      rows.push(row);
    }
    const placement = rows.join('/');
    const side = this.state.sideToMove;
    const rightsStr = (color: Color, upper: boolean): string => {
      const rights = [...this.state.castleRights[color]].sort((a, b2) => fileOf(a.partnerStart) - fileOf(b2.partnerStart));
      return rights.map((r) => {
        const letter = FILES[fileOf(r.partnerStart)]!;
        return upper ? letter.toUpperCase() : letter;
      }).join('');
    };
    let castling = rightsStr('w', true) + rightsStr('b', false);
    if (castling === '') castling = '-';
    const ep = this.state.epSquare !== null ? squareName(this.state.epSquare) : '-';
    const halfmove = this.state.halfmoveClock;
    const fullmove = Math.floor(this.state.ply / 2) + 1;
    return `${placement} ${side} ${castling} ${ep} ${halfmove} ${fullmove}`;
  }

  moveToUci(m: Move): string {
    const fromStr = squareName(m.from);
    const toStr = squareName(m.to);
    let promoStr = '';
    if (m.promo) {
      const glyph = this.ruleset.pieces[m.promo]?.glyph ?? '?';
      promoStr = glyph.toLowerCase();
    }
    return `${fromStr}${toStr}${promoStr}`;
  }

  parseUci(uci: string): Move | null {
    const fromStr = uci.slice(0, 2);
    const toStr = uci.slice(2, 4);
    const promoChar = uci.length > 4 ? uci.slice(4) : undefined;
    const from = parseSquareName(fromStr);
    const to = parseSquareName(toStr);
    let promoId: string | undefined;
    if (promoChar) {
      for (const [id, p] of Object.entries(this.ruleset.pieces)) {
        if (p.glyph.toLowerCase() === promoChar.toLowerCase()) { promoId = id; break; }
      }
    }
    const legal = this.legalMoves();
    for (const m of legal) {
      if (m.from === from && m.to === to && (m.promo ?? undefined) === (promoId ?? undefined)) return m;
    }
    return null;
  }
}

// King vectors: standard one-step both-mode in all 8 directions.
const KING_VECTORS: Vector[] = [
  { dx: 1, dy: 0, range: 1, path: 'leap', mode: 'both' },
  { dx: -1, dy: 0, range: 1, path: 'leap', mode: 'both' },
  { dx: 0, dy: 1, range: 1, path: 'leap', mode: 'both' },
  { dx: 0, dy: -1, range: 1, path: 'leap', mode: 'both' },
  { dx: 1, dy: 1, range: 1, path: 'leap', mode: 'both' },
  { dx: 1, dy: -1, range: 1, path: 'leap', mode: 'both' },
  { dx: -1, dy: 1, range: 1, path: 'leap', mode: 'both' },
  { dx: -1, dy: -1, range: 1, path: 'leap', mode: 'both' },
];

// ---------------------------------------------------------------------------
// createGame / fromFEN
// ---------------------------------------------------------------------------

function isRookTierOf(ruleset: Ruleset, pieceId: string): boolean {
  const p = ruleset.pieces[pieceId];
  return !!p && p.tier === 'rook';
}

function computeCastleRightsFromBoard(ruleset: Ruleset, board: (BoardPiece | null)[], color: Color): CastleRight[] {
  const rank = color === 'w' ? 0 : 7;
  let kingSq = -1;
  for (let f = 0; f < 8; f++) {
    const bp = board[sq(f, rank)];
    if (bp && bp.color === color && bp.pieceId === KING_ID) { kingSq = sq(f, rank); break; }
  }
  if (kingSq === -1) return [];
  const kingFile = fileOf(kingSq);
  const rights: CastleRight[] = [];
  for (let f = kingFile - 1; f >= 0; f--) {
    const bp = board[sq(f, rank)];
    if (bp && bp.color === color && isRookTierOf(ruleset, bp.pieceId)) {
      rights.push({ kingStart: kingSq, partnerStart: sq(f, rank), side: 'queen' });
      break;
    }
  }
  for (let f = kingFile + 1; f < 8; f++) {
    const bp = board[sq(f, rank)];
    if (bp && bp.color === color && isRookTierOf(ruleset, bp.pieceId)) {
      rights.push({ kingStart: kingSq, partnerStart: sq(f, rank), side: 'king' });
      break;
    }
  }
  return rights;
}

export function createGame(ruleset: Ruleset, whiteSetup: string, blackSetup: string): Game {
  const wSetup = parseSetup(whiteSetup);
  const bSetup = parseSetup(blackSetup);
  if (wSetup.version !== ruleset.version) throw new Error(`white setup version '${wSetup.version}' does not match ruleset version '${ruleset.version}'`);
  if (bSetup.version !== ruleset.version) throw new Error(`black setup version '${bSetup.version}' does not match ruleset version '${ruleset.version}'`);

  const board: (BoardPiece | null)[] = new Array(64).fill(null);

  const place = (setup: typeof wSetup, color: Color) => {
    for (let rankIdx = 0; rankIdx < 3; rankIdx++) {
      for (let file = 0; file < 8; file++) {
        const id = setup.ranks[rankIdx]![file]!;
        if (id === null) continue;
        if (id !== KING_ID && !ruleset.pieces[id]) throw new Error(`unknown piece id '${id}' in setup`);
        const s = setupSquare(color, rankIdx, file);
        board[s] = { pieceId: id, color, hasMoved: false };
      }
    }
  };
  place(wSetup, 'w');
  place(bSetup, 'b');

  const castleRights = {
    w: computeCastleRightsFromBoard(ruleset, board, 'w'),
    b: computeCastleRightsFromBoard(ruleset, board, 'b'),
  };

  return new GameImpl(ruleset, board, 'w', castleRights, null, 0, 0);
}

export function fromFEN(ruleset: Ruleset, fen: string): Game {
  const parts = fen.trim().split(/\s+/);
  const [placement, sideStr, castlingStr, epStr, halfmoveStr, fullmoveStr] = parts;
  if (!placement) throw new Error('invalid FEN: missing placement');

  const glyphToId = new Map<string, string>();
  for (const [id, p] of Object.entries(ruleset.pieces)) glyphToId.set(p.glyph.toUpperCase(), id);

  const board: (BoardPiece | null)[] = new Array(64).fill(null);
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('invalid FEN: expected 8 ranks');
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i;
    const row = rows[i]!;
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { file += Number(ch); continue; }
      const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
      const upper = ch.toUpperCase();
      const pieceId = upper === KING_GLYPH ? KING_ID : glyphToId.get(upper);
      if (!pieceId) throw new Error(`unknown FEN glyph '${ch}'`);
      board[sq(file, rank)] = { pieceId, color, hasMoved: true };
      file++;
    }
  }

  const side: Color = sideStr === 'b' ? 'b' : 'w';

  const castleRights: { w: CastleRight[]; b: CastleRight[] } = { w: [], b: [] };
  const unmovedSquares = new Set<number>();

  if (castlingStr && castlingStr !== '-') {
    for (const color of ['w', 'b'] as Color[]) {
      const rank = color === 'w' ? 0 : 7;
      let kingSq = -1;
      for (let f = 0; f < 8; f++) {
        const bp = board[sq(f, rank)];
        if (bp && bp.color === color && bp.pieceId === KING_ID) { kingSq = sq(f, rank); break; }
      }
      if (kingSq === -1) continue;
      const kingFile = fileOf(kingSq);
      const chars = castlingStr.split('').filter((c) => color === 'w' ? (c >= 'A' && c <= 'Z') : (c >= 'a' && c <= 'z'));
      for (const c of chars) {
        let partnerSq = -1;
        if (c.toUpperCase() === 'K' || c.toUpperCase() === 'Q') {
          if (c.toUpperCase() === 'K') {
            for (let f = 7; f > kingFile; f--) {
              const bp = board[sq(f, rank)];
              if (bp && bp.color === color && isRookTierOf(ruleset, bp.pieceId)) { partnerSq = sq(f, rank); break; }
            }
          } else {
            for (let f = 0; f < kingFile; f++) {
              const bp = board[sq(f, rank)];
              if (bp && bp.color === color && isRookTierOf(ruleset, bp.pieceId)) { partnerSq = sq(f, rank); break; }
            }
          }
        } else {
          const f = FILES.indexOf(c.toLowerCase());
          partnerSq = sq(f, rank);
        }
        if (partnerSq === -1) continue;
        const side2: 'king' | 'queen' = fileOf(partnerSq) > kingFile ? 'king' : 'queen';
        castleRights[color].push({ kingStart: kingSq, partnerStart: partnerSq, side: side2 });
        unmovedSquares.add(kingSq);
        unmovedSquares.add(partnerSq);
      }
    }
  }

  for (let s = 0; s < 64; s++) {
    const bp = board[s];
    if (!bp) continue;
    if (unmovedSquares.has(s)) { bp.hasMoved = false; continue; }
    if (bp.pieceId === VANILLA_PAWN_ID && relRank(s, bp.color) === 2) { bp.hasMoved = false; continue; }
    bp.hasMoved = true;
  }

  let epSquare: Square | null = null;
  if (epStr && epStr !== '-') epSquare = parseSquareName(epStr);

  const halfmove = halfmoveStr ? Number(halfmoveStr) : 0;
  const fullmove = fullmoveStr ? Number(fullmoveStr) : 1;
  const ply = (fullmove - 1) * 2 + (side === 'b' ? 1 : 0);

  return new GameImpl(ruleset, board, side, castleRights, epSquare, halfmove, ply);
}

export function perft(game: Game, depth: number): number {
  if (depth === 0) return 1;
  const moves = game.legalMoves();
  if (depth === 1) return moves.length;
  let count = 0;
  for (const m of moves) {
    game.make(m);
    count += perft(game, depth - 1);
    game.unmake();
  }
  return count;
}

export function divide(game: Game, depth: number): Record<string, number> {
  const result: Record<string, number> = {};
  const moves = game.legalMoves();
  for (const m of moves) {
    game.make(m);
    const count = depth > 1 ? perft(game, depth - 1) : 1;
    game.unmake();
    result[game.moveToUci(m)] = count;
  }
  return result;
}
