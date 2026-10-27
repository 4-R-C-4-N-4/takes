/** Takes piece schema — see docs/spec.md "Piece schema" and docs/DECISIONS.md. */
export type Dir = 'f' | 'b' | 'l' | 'r' | 'fl' | 'fr' | 'bl' | 'br';
export type Tier = 'pawn' | 'minor' | 'rook' | 'major';
export type Mode = 'move' | 'capture' | 'both';
export type PathType = 'leap' | 'slide';
export type Color = 'w' | 'b';

export interface Component {
  /** Base displacement (dx, dy), owner-relative, forward = +dy. */
  vec: [number, number];
  /** 'all' = every sign/axis-swap variant; otherwise keep only listed directions. */
  sym: 'all' | Dir[];
  /** Max repetitions. 1 = step/leap, Infinity = unlimited slide. (JSON: null = Infinity.) */
  range: number;
  path: PathType;
  mode: Mode;
  /** Only from relative rank 2 while unmoved. Vanilla pawn only (v1). */
  cond?: 'rank2';
}

export interface Piece {
  id: string;
  name: string;
  /** Single uppercase letter, unique per ruleset, never 'K' [D5]. FEN/UCI letter. */
  glyph: string;
  tier: Tier;
  components: Component[];
  value?: number;
}

export type PromotionMode = 'own-set' | 'list';

/** A published, immutable ruleset. Embeds full piece definitions [D4]. */
export interface Ruleset {
  version: string;
  /** Piece definitions keyed by id. The king is engine-fixed and NOT listed here. */
  pieces: Record<string, Piece>;
  /** Setup cost per piece id. */
  costs: Record<string, number>;
  pool: number;
  maxCount: Record<string, number>;
  promotionMode: PromotionMode;
  /** Used when promotionMode = 'list'. */
  promotionTargets: string[];
  /** Used when own-set yields nothing [D6]. */
  promotionFallback: string[];
  /** Draw by move cap [D11]. */
  maxPlies: number;
}

/** One expanded, absolute-orientation vector for a color. */
export interface Vector {
  dx: number;
  dy: number;
  range: number;
  path: PathType;
  mode: Mode;
  cond?: 'rank2';
}

/** A placed piece in a setup or on a board. id 'king' is the engine king. */
export interface Placed {
  pieceId: string;
}

export const KING_ID = 'king';
export const VANILLA_PAWN_ID = 'pawn';
