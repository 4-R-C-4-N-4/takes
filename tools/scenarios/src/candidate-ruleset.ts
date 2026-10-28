/** Builds a per-candidate Ruleset: getRuleset(version) + the candidate piece, assigned a unique
 * glyph and a placeholder cost (same as the reference piece it substitutes for, so setup budgets
 * stay balanced during screening — real pricing happens later, Ivy's job per docs/catalog/PLAN.md). */
import type { CatalogEntry } from '@takes/catalog';
import type { Piece, Ruleset } from '@takes/library';
import { assignGlyph } from './glyph.js';

export interface CandidateRuleset {
  ruleset: Ruleset;
  candidateId: string;
}

export function buildCandidateRuleset(base: Ruleset, entry: CatalogEntry, costPawns: number): CandidateRuleset {
  const glyph = assignGlyph(base);
  const id = entry.piece.id;
  const piece: Piece = { ...entry.piece, id, glyph };
  const ruleset: Ruleset = {
    ...base,
    pieces: { ...base.pieces, [id]: piece },
    costs: { ...base.costs, [id]: costPawns },
  };
  return { ruleset, candidateId: id };
}
