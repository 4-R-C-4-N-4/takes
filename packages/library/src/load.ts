import type { Component, Piece, Ruleset } from './types.js';

/** JSON form: Infinity is written as null. */
export type ComponentJSON = Omit<Component, 'range'> & { range: number | null };
export type PieceJSON = Omit<Piece, 'components'> & { components: ComponentJSON[] };
export type RulesetJSON = Omit<Ruleset, 'pieces'> & { pieces: Record<string, PieceJSON> };

export function pieceFromJSON(j: PieceJSON): Piece {
  return { ...j, components: j.components.map((c) => ({ ...c, range: c.range === null ? Infinity : c.range })) };
}
export function pieceToJSON(p: Piece): PieceJSON {
  return { ...p, components: p.components.map((c) => ({ ...c, range: c.range === Infinity ? null : c.range })) };
}
export function rulesetFromJSON(j: RulesetJSON): Ruleset {
  const pieces: Record<string, Piece> = {};
  for (const [id, pj] of Object.entries(j.pieces)) pieces[id] = pieceFromJSON(pj);
  return { ...j, pieces };
}
export function rulesetToJSON(r: Ruleset): RulesetJSON {
  const pieces: Record<string, PieceJSON> = {};
  for (const [id, p] of Object.entries(r.pieces)) pieces[id] = pieceToJSON(p);
  return { ...r, pieces };
}
