/** Injects pieceValueMg/Eg lines into a generated variants.ini (FSF option names verified against types.h). */
import type { Ruleset } from '@takes/library';

export interface PieceValueOverride {
  pieceId: string;
  mg: number;
  eg: number;
}

export function withPieceValues(ini: string, r: Ruleset, overrides: PieceValueOverride[]): string {
  if (overrides.length === 0) return ini;
  const letter = (id: string) => r.pieces[id]!.glyph.toLowerCase();
  const mg = overrides.map((o) => `${letter(o.pieceId)}:${Math.round(o.mg)}`).join(' ');
  const eg = overrides.map((o) => `${letter(o.pieceId)}:${Math.round(o.eg)}`).join(' ');
  return ini + `pieceValueMg = ${mg}\npieceValueEg = ${eg}\n`;
}

/** FSF classical material scale (src/types.h); 1 pawn ~= PawnValueMg/Eg internal units. */
export const PAWN_VALUE_MG = 126;
export const PAWN_VALUE_EG = 208;

export function pawnsToInternal(pawns: number): { mg: number; eg: number } {
  return { mg: pawns * PAWN_VALUE_MG, eg: pawns * PAWN_VALUE_EG };
}
