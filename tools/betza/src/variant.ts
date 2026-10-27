/** Fairy-Stockfish variants.ini generator for a Takes ruleset [impl.md "Variant config"; DECISIONS D2, D5, D6, D12]. */
import type { Ruleset } from '@takes/library';
import { VANILLA_PAWN_ID } from '@takes/library';
import { pieceToBetza } from './betza.js';

/** Classic ids that map 1:1 onto FSF built-ins with identical movement. */
const BUILTIN: Record<string, string> = { pawn: 'pawn', knight: 'knight', bishop: 'bishop', rook: 'rook', queen: 'queen' };
export const FSF_MAX_CUSTOM = 25;

export interface VariantOptions {
  name?: string;
  /** Per-color promotion targets (piece ids). Defaults: all non-pawn-tier pieces. */
  promotion?: { w: string[]; b: string[] };
  startFen?: string;
}

export function variantName(r: Ruleset): string { return 'takes_' + r.version.replace(/\W/g, '_'); }

export function variantIni(r: Ruleset, opts: VariantOptions = {}): string {
  const name = opts.name ?? variantName(r);
  const lines: string[] = [`[${name}]`, 'king = k'];
  const letter = (id: string) => r.pieces[id]!.glyph.toLowerCase();
  let custom = 0;
  const limitations: string[] = [];
  for (const p of Object.values(r.pieces)) {
    const builtin = BUILTIN[p.id];
    if (builtin) { lines.push(`${builtin} = ${letter(p.id)}`); continue; }
    custom++;
    if (custom > FSF_MAX_CUSTOM) throw new Error(`ruleset ${r.version} needs more than ${FSF_MAX_CUSTOM} FSF custom piece slots`);
    lines.push(`customPiece${custom} = ${letter(p.id)}:${pieceToBetza(p)}`);
  }
  const ids = Object.keys(r.pieces);
  const rookTier = ids.filter((id) => r.pieces[id]!.tier === 'rook').map(letter).join('');
  const pawnTier = ids.filter((id) => r.pieces[id]!.tier === 'pawn').map(letter).join('');
  const promoAll = ids.filter((id) => r.pieces[id]!.tier !== 'pawn');
  const promo = opts.promotion ?? { w: promoAll, b: promoAll };
  lines.push(
    `castlingRookPieces = ${rookTier || '-'}`,
    `promotionPawnTypes = ${pawnTier}`,
    `promotionPieceTypesWhite = ${promo.w.map(letter).join('')}`,
    `promotionPieceTypesBlack = ${promo.b.map(letter).join('')}`,
    `enPassantTypes = ${r.pieces[VANILLA_PAWN_ID] ? letter(VANILLA_PAWN_ID) : '-'}`,
    'mandatoryPawnPromotion = true',
    'chess960 = true',
    'nMoveRule = 0',
    'nFoldRule = 3',
    `startFen = ${opts.startFen ?? '4k3/8/8/8/8/8/8/4K3 w - - 0 1'}`,
  );
  if (limitations.length) lines.unshift(...limitations.map((l) => `# LIMITATION: ${l}`));
  return lines.join('\n') + '\n';
}
