// Shared piece-art/palette helpers for Svelte components (not pure-logic test scope,
// but tiny glue functions so components stay thin).
import type { Piece, Ruleset } from '@takes/library';
import { pieceSvg, resolveArt } from '@takes/art';
import { KING_PIECE } from './king.js';

const artOverrides = import.meta.glob('/../../packages/library/pieces/*/art.svg', {
  query: '?raw',
  eager: true,
}) as Record<string, string>;

function overrideFor(id: string): string | undefined {
  for (const [path, content] of Object.entries(artOverrides)) {
    if (path.includes(`/${id}/art.svg`)) return content;
  }
  return undefined;
}

export function pieceById(ruleset: Ruleset, id: string): Piece {
  if (id === 'king') return KING_PIECE;
  const p = ruleset.pieces[id];
  if (!p) throw new Error(`unknown piece id ${id}`);
  return p;
}

export function artFor(ruleset: Ruleset, id: string): string {
  const piece = pieceById(ruleset, id);
  const procedural = pieceSvg(piece);
  return resolveArt(id, overrideFor(id), procedural);
}

export function tierOrder(): Array<Piece['tier']> {
  return ['major', 'rook', 'minor', 'pawn'];
}
