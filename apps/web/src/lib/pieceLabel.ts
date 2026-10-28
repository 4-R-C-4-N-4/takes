// Player-facing piece label [D20]: movement shorthand (Betza notation) is the primary
// label for every non-classic piece, with the human name as a secondary nickname.
// Classics (Pawn, Knight, Bishop, Rook, Queen, King) keep their familiar names as
// primary, since everyone already knows them; notation is secondary for those.
import type { Piece } from '@takes/library';
import { pieceToBetza } from '@takes/betza/pure';

const CLASSIC_IDS = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']);

export interface PieceLabel {
  /** Primary label text: notation for non-classics, the familiar name for classics. */
  primary: string;
  /** Secondary label text: the name for non-classics, notation for classics (empty for King). */
  secondary: string;
  /** True when `primary` is Betza notation and should render in a mono font. */
  primaryIsNotation: boolean;
  /** Raw Betza notation string, normalised for display. '' if unavailable (e.g. King has no moves to export). */
  notation: string;
  /** The piece's human name, e.g. 'Scarab'. */
  nickname: string;
}

/**
 * Normalise an exporter's Betza output to the canonical display form used in
 * docs/catalog/verdicts.json, in case the exporter emits an equivalent but
 * differently-ordered/spelled string (e.g. term order, or m/c-prefixed variants).
 */
export function normaliseBetza(betza: string): string {
  return betza
    // Drop the FSF documentation form for the vanilla pawn; it isn't shown to players.
    .replace(/^fmWfceFifmnD$/, '');
}

function computeNotation(piece: Piece): string {
  try {
    return normaliseBetza(pieceToBetza(piece));
  } catch {
    return '';
  }
}

/** Build the { notation, nickname } + display-ready label pair for a piece. */
export function pieceLabel(piece: Piece): PieceLabel {
  const notation = computeNotation(piece);
  const nickname = piece.name;
  const isClassic = CLASSIC_IDS.has(piece.id);
  if (isClassic) {
    return { primary: nickname, secondary: notation, primaryIsNotation: false, notation, nickname };
  }
  return { primary: notation || nickname, secondary: nickname, primaryIsNotation: notation.length > 0, notation, nickname };
}
