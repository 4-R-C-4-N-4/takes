/**
 * Takes engine — public API CONTRACT. Pure, deterministic, no I/O, no randomness, no UI imports.
 * Other packages (web, server, tools) code against exactly these exports. Do not change signatures
 * without updating docs/PROGRESS.md "Contracts".
 */
import type { Color, Ruleset } from '@takes/library';

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

/** Build a game from two setup strings (each from its owner's POV) [impl.md "Setup string"]. */
export declare function createGame(ruleset: Ruleset, whiteSetup: string, blackSetup: string): Game;
/** Load an arbitrary position. Letters = piece glyphs [D5]; castling field Shredder or KQkq. */
export declare function fromFEN(ruleset: Ruleset, fen: string): Game;
export declare function perft(game: Game, depth: number): number;
export declare function divide(game: Game, depth: number): Record<string, number>;
