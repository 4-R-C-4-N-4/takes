// Single source of truth for the component -> motif mapping used by both the
// procedural SVG generator (packages/art) and the codex prompt builder (tools/artgen).
import type { Piece, Vector } from '@takes/library';
import { expandPiece, canMove, canCapture } from '@takes/library';

export type Tier = 'pawn' | 'minor' | 'rook' | 'major';

export type Motif = 'orthogonal' | 'diagonal' | 'leap' | 'forward-only' | 'plain';

/** Per-tier baseline size table. Canvas is 100x100; baseline (ground line) is fixed. */
export interface TierSize {
  /** total height of the silhouette in canvas units */
  height: number;
  /** total width of the silhouette in canvas units */
  width: number;
}

export const BASELINE_Y = 90;

export const TIER_SIZE: Record<Tier, TierSize> = {
  pawn: { height: 38, width: 34 },
  minor: { height: 54, width: 44 },
  rook: { height: 46, width: 56 },
  major: { height: 66, width: 40 },
};

/** Classify a set of expanded vectors into the motifs present among them. */
export function motifsForVectors(vectors: Vector[]): Set<Motif> {
  const motifs = new Set<Motif>();
  for (const v of vectors) {
    if (v.path === 'leap') {
      motifs.add('leap');
      continue;
    }
    if (v.dx !== 0 && v.dy !== 0) motifs.add('diagonal');
    else if (v.dx !== 0 || v.dy !== 0) motifs.add('orthogonal');
    if (v.cond === 'rank2') motifs.add('forward-only');
  }
  if (motifs.size === 0) motifs.add('plain');
  return motifs;
}

/** Move-set motifs (body) and capture-set motifs (crest, only if distinct from body). */
export function pieceMotifs(p: Piece, color: 'w' | 'b' = 'w') {
  const vectors = expandPiece(p, color);
  const moveVectors = vectors.filter(canMove);
  const captureVectors = vectors.filter(canCapture);
  const body = motifsForVectors(moveVectors);
  const captureMotifs = motifsForVectors(captureVectors);
  const sameAsBody =
    captureMotifs.size === body.size && [...captureMotifs].every((m) => body.has(m));
  const crest = sameAsBody ? null : captureMotifs;
  return { body, crest, moveVectors, captureVectors };
}

const MOTIF_DESCRIPTIONS: Record<Motif, string> = {
  orthogonal: 'square, crenellated (castle-like notches)',
  diagonal: 'slashed, mitred (angled pointed cuts)',
  leap: 'wings or an animal-head motif',
  'forward-only': 'a pointed top',
  plain: 'a plain rounded top',
};

const TIER_DESCRIPTIONS: Record<Tier, string> = {
  pawn: 'small and round',
  minor: 'medium-sized',
  rook: 'squat and wide',
  major: 'tall',
};

/** Build a codex image-gen prompt fragment describing this piece's grammar. */
export function describePieceGrammar(p: Piece): string {
  const { body, crest } = pieceMotifs(p, 'w');
  const bodyDesc = [...body].map((m) => MOTIF_DESCRIPTIONS[m]).join(' and ');
  const tierDesc = TIER_DESCRIPTIONS[p.tier as Tier];
  let s = `A ${tierDesc} chess piece silhouette (tier: ${p.tier}). Body shape: ${bodyDesc}, composing all these traits into one coherent form.`;
  if (crest) {
    const crestDesc = [...crest].map((m) => MOTIF_DESCRIPTIONS[m]).join(' and ');
    s += ` It has a distinct crest/top ornament reflecting: ${crestDesc}, visually different from the body motif.`;
  }
  return s;
}
