// Single source of truth for the component -> motif mapping used by both the
// procedural SVG generator (packages/art) and the codex prompt builder (tools/artgen).
import type { Piece, Vector } from '@takes/library';
import { expandPiece, canMove, canCapture } from '@takes/library';

export type Tier = 'pawn' | 'minor' | 'rook' | 'major';

/** Coarse motif tags kept for backwards-compat callers (describePieceGrammar). */
export type Motif = 'orthogonal' | 'diagonal' | 'leap' | 'forward-only' | 'plain';

/** Per-tier baseline size table. Canvas is 100x100; baseline (ground line) is fixed.
 * Tallest tier (major) reaches ~90% of the box; pawn ~59% including outline; widths are scaled
 * so silhouettes stay bold (wide) at 40px. */
export interface TierSize {
  /** total height of the silhouette in canvas units */
  height: number;
  /** total width of the silhouette in canvas units */
  width: number;
}

export const BASELINE_Y = 92;

export const TIER_SIZE: Record<Tier, TierSize> = {
  pawn: { height: 56, width: 42 },
  minor: { height: 78, width: 52 },
  rook: { height: 70, width: 66 },
  major: { height: 88, width: 48 },
};

// ---------------------------------------------------------------------------
// Extended grammar: per-axis presence + range (step vs slide).
//
// Rather than a single coarse "orthogonal"/"diagonal" tag, we classify each of
// the 8 compass axes (f, b, l, r, fl, fr, bl, br) independently: is a vector
// present along that axis, and is it a step (finite range) or a slide
// (range === Infinity)? This lets the renderer distinguish direction SUBSETS
// (forward-only, sideways-only, vertical-only, all-four) and RANGE (step vs
// slide) per axis, which is what separates e.g. warden (sideways slide +
// vertical step) from rook (all four, slide) or lancer (forward slide +
// backward step) from pawn (forward step only).
// ---------------------------------------------------------------------------

export type RangeClass = 'slide' | 'step';

export interface AxisState {
  present: boolean;
  range: RangeClass;
}

export interface OrthoSignature {
  forward: AxisState;
  backward: AxisState;
  left: AxisState;
  right: AxisState;
}

export interface DiagSignature {
  fl: AxisState;
  fr: AxisState;
  bl: AxisState;
  br: AxisState;
}

export interface Signature {
  ortho: OrthoSignature;
  diag: DiagSignature;
  leap: boolean;
}

function axis(vectors: Vector[], dx: number, dy: number): AxisState {
  let present = false;
  let range: RangeClass = 'step';
  for (const v of vectors) {
    if (v.path === 'leap') continue;
    const sx = Math.sign(v.dx);
    const sy = Math.sign(v.dy);
    if (sx !== dx || sy !== dy) continue;
    present = true;
    if (v.range === Infinity || v.range === null) range = 'slide';
  }
  return { present, range };
}

/** Classify a set of expanded vectors into the full per-axis signature. */
export function signatureForVectors(vectors: Vector[]): Signature {
  return {
    ortho: {
      forward: axis(vectors, 0, 1),
      backward: axis(vectors, 0, -1),
      left: axis(vectors, -1, 0),
      right: axis(vectors, 1, 0),
    },
    diag: {
      fl: axis(vectors, -1, 1),
      fr: axis(vectors, 1, 1),
      bl: axis(vectors, -1, -1),
      br: axis(vectors, 1, -1),
    },
    leap: vectors.some((v) => v.path === 'leap'),
  };
}

export function signatureEquals(a: Signature, b: Signature): boolean {
  const axEq = (x: AxisState, y: AxisState) => x.present === y.present && (!x.present || x.range === y.range);
  return (
    axEq(a.ortho.forward, b.ortho.forward) &&
    axEq(a.ortho.backward, b.ortho.backward) &&
    axEq(a.ortho.left, b.ortho.left) &&
    axEq(a.ortho.right, b.ortho.right) &&
    axEq(a.diag.fl, b.diag.fl) &&
    axEq(a.diag.fr, b.diag.fr) &&
    axEq(a.diag.bl, b.diag.bl) &&
    axEq(a.diag.br, b.diag.br) &&
    a.leap === b.leap
  );
}

export function hasAnyOrtho(s: Signature): boolean {
  return s.ortho.forward.present || s.ortho.backward.present || s.ortho.left.present || s.ortho.right.present;
}

export function hasAnyDiag(s: Signature): boolean {
  return s.diag.fl.present || s.diag.fr.present || s.diag.bl.present || s.diag.br.present;
}

/** Legacy coarse motif set, kept for describePieceGrammar() prompt text. */
export function motifsForVectors(vectors: Vector[]): Set<Motif> {
  const sig = signatureForVectors(vectors);
  const motifs = new Set<Motif>();
  if (sig.leap) motifs.add('leap');
  if (hasAnyOrtho(sig)) motifs.add('orthogonal');
  if (hasAnyDiag(sig)) motifs.add('diagonal');
  if (
    (sig.ortho.forward.present || sig.diag.fl.present || sig.diag.fr.present) &&
    !sig.ortho.backward.present &&
    !sig.ortho.left.present &&
    !sig.ortho.right.present &&
    !sig.diag.bl.present &&
    !sig.diag.br.present
  ) {
    motifs.add('forward-only');
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

/** Full per-axis signatures for body (move) and crest (capture, only if distinct). */
export function pieceSignatures(p: Piece, color: 'w' | 'b' = 'w') {
  const vectors = expandPiece(p, color);
  const moveVectors = vectors.filter(canMove);
  const captureVectors = vectors.filter(canCapture);
  const body = signatureForVectors(moveVectors);
  const captureSig = signatureForVectors(captureVectors);
  const crest = signatureEquals(body, captureSig) ? null : captureSig;
  return { body, crest };
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
