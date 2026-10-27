import type { Color, Component, Piece, Ruleset, Tier } from '@takes/library';
import {
  KING_ID,
  VANILLA_PAWN_ID,
  expandPiece,
  canCapture,
  canMove,
  parseSetup,
  setupCounts,
  setupCost,
  setupSquare,
  SetupParseError,
  dirLabel,
  symmetryVariants,
} from '@takes/library';
import type { Setup } from '@takes/library';

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  squares: number[];
  pieceId?: string;
  data?: Record<string, unknown>;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/**
 * Value bands per tier [spec.md "Tiers"]. Placeholder numbers — not yet
 * measured via engine self-play (spec.md "Valuation"). Warning-only (D1).
 */
export const VALUE_BANDS: Record<Tier, [number, number]> = {
  pawn: [0.5, 1.5],
  minor: [2, 4],
  rook: [4, 6.5],
  major: [7, 11],
};

const err = (code: string, message: string, squares: number[] = [], extra: Partial<Issue> = {}): Issue => ({
  severity: 'error',
  code,
  message,
  squares,
  ...extra,
});
const warn = (code: string, message: string, squares: number[] = [], extra: Partial<Issue> = {}): Issue => ({
  severity: 'warning',
  code,
  message,
  squares,
  ...extra,
});

/** D3: slide components must be unit vectors (W or F direction); no riders in v1. */
function isSlideUnit(c: Component): boolean {
  return Math.max(Math.abs(c.vec[0]), Math.abs(c.vec[1])) === 1 && c.range >= 1;
}

/** Leap cap: |dy| <= 2, range 1, max(|dx|,|dy|) >= 2, must clear >= 1 square. */
function isLeapValid(c: Component): boolean {
  if (c.range !== 1) return false;
  if (Math.abs(c.vec[1]) > 2) return false;
  if (Math.max(Math.abs(c.vec[0]), Math.abs(c.vec[1])) < 2) return false;
  return true;
}

/**
 * D1: structural castling eligibility. A slide component with infinite range,
 * unit vector, covering both 'l' and 'r' directions, in any mode.
 */
export function isCastlingEligible(p: Piece): boolean {
  for (const c of p.components) {
    if (c.path !== 'slide' || c.range !== Infinity) continue;
    if (Math.max(Math.abs(c.vec[0]), Math.abs(c.vec[1])) !== 1) continue;
    const dirs = new Set(
      c.sym === 'all'
        ? symmetryVariants(c.vec[0], c.vec[1]).map(([dx, dy]) => dirLabel(dx, dy)).filter((d): d is NonNullable<typeof d> => d !== null)
        : c.sym,
    );
    if (dirs.has('l') && dirs.has('r')) return true;
  }
  return false;
}

/** D7: pawn-tier "never stranded" — move-mode destinations only, ranks 1-7 (idx 0-6), empty board. */
function pawnStrandedSquares(p: Piece): number[] {
  const vectors = expandPiece(p, 'w').filter(canMove);
  const stranded: number[] = [];
  for (let rank = 0; rank <= 6; rank++) {
    for (let file = 0; file < 8; file++) {
      let ok = false;
      for (const v of vectors) {
        const nf = file + v.dx;
        const nr = rank + v.dy;
        if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) { ok = true; break; }
      }
      if (!ok) stranded.push(rank * 8 + file);
    }
  }
  return stranded;
}

function schemaSanity(p: Piece): Issue[] {
  const issues: Issue[] = [];
  for (const [i, c] of p.components.entries()) {
    if (c.vec[0] === 0 && c.vec[1] === 0) {
      issues.push(err('BAD_VECTOR', `component ${i} has a zero vector`, [], { pieceId: p.id }));
    }
    if (!(c.range === Infinity || (Number.isInteger(c.range) && c.range > 0))) {
      issues.push(err('BAD_RANGE', `component ${i} has an invalid range`, [], { pieceId: p.id }));
    }
    if (c.sym !== 'all' && (!Array.isArray(c.sym) || c.sym.length === 0)) {
      issues.push(err('BAD_SYM', `component ${i} has an invalid sym`, [], { pieceId: p.id }));
    }
  }
  return issues;
}

/** Piece validation [impl.md "Piece validation"]. */
export function validatePiece(p: Piece): Issue[] {
  const issues: Issue[] = [...schemaSanity(p)];

  // GLYPH [D5]
  if (!/^[A-Z]$/.test(p.glyph) || p.glyph === 'K') {
    issues.push(err('GLYPH', `glyph '${p.glyph}' must be a single uppercase letter A-Z, not 'K'`, [], { pieceId: p.id }));
  }

  // HAS_CAPTURE
  const hasCapture = p.components.some((c) => c.mode === 'capture' || c.mode === 'both');
  if (!hasCapture) {
    issues.push(err('HAS_CAPTURE', `piece '${p.id}' has no capture-capable component`, [], { pieceId: p.id }));
  }

  for (const [i, c] of p.components.entries()) {
    // RANK2_RESERVED
    if (c.cond === 'rank2' && p.id !== VANILLA_PAWN_ID) {
      issues.push(err('RANK2_RESERVED', `only '${VANILLA_PAWN_ID}' may use cond rank2 (component ${i})`, [], { pieceId: p.id }));
    }
    if (c.path === 'leap' && !isLeapValid(c)) {
      issues.push(err('LEAP_CAP', `component ${i} is an invalid leap (needs |dy|<=2, range 1, max(|dx|,|dy|)>=2)`, [], { pieceId: p.id }));
    }
    if (c.path === 'slide' && !isSlideUnit(c)) {
      issues.push(err('SLIDE_UNIT', `component ${i} slide vector must be a unit vector (D3)`, [], { pieceId: p.id }));
    }
  }

  // PAWN_FORWARD / PAWN_STRANDED
  if (p.tier === 'pawn') {
    const vectors = expandPiece(p, 'w');
    const notForward = vectors.filter((v) => v.dy < 1);
    if (notForward.length > 0) {
      issues.push(err('PAWN_FORWARD', `pawn-tier piece '${p.id}' has a non-forward component`, [], { pieceId: p.id }));
    }
    const stranded = pawnStrandedSquares(p);
    if (stranded.length > 0) {
      issues.push(err('PAWN_STRANDED', `pawn-tier piece '${p.id}' is stranded on ${stranded.length} square(s) with only move-mode vectors`, stranded, { pieceId: p.id }));
    }
  }

  // ROOK_CASTLING [D1]
  if (p.tier === 'rook' && !isCastlingEligible(p)) {
    issues.push(err('ROOK_CASTLING', `rook-tier piece '${p.id}' is not castling-eligible (needs an infinite unit slide covering l and r)`, [], { pieceId: p.id }));
  }

  // VALUE_BAND (warning only)
  if (p.value !== undefined) {
    const [lo, hi] = VALUE_BANDS[p.tier];
    if (p.value < lo || p.value > hi) {
      issues.push(warn('VALUE_BAND', `piece '${p.id}' value ${p.value} is outside the ${p.tier} band [${lo}, ${hi}]`, [], { pieceId: p.id }));
    }
  }

  return issues;
}

/** Ruleset validation: per-piece rules + cross-piece rules. */
export function validateRuleset(r: Ruleset): Issue[] {
  const issues: Issue[] = [];

  if (r.pieces[KING_ID]) {
    issues.push(err('NO_KING_PIECE', `ruleset must not define a library piece with id '${KING_ID}'`, []));
  }

  const glyphs = new Map<string, string[]>();
  for (const [id, p] of Object.entries(r.pieces)) {
    for (const issue of validatePiece(p)) issues.push(issue);
    const list = glyphs.get(p.glyph) ?? [];
    list.push(id);
    glyphs.set(p.glyph, list);

    if (!(id in r.costs)) {
      issues.push(err('MISSING_COST', `piece '${id}' has no entry in ruleset costs`, [], { pieceId: id }));
    }
  }

  for (const [glyph, ids] of glyphs.entries()) {
    if (ids.length > 1) {
      issues.push(err('GLYPH_UNIQUE', `glyph '${glyph}' is used by multiple pieces: ${ids.join(', ')}`, []));
    }
  }

  for (const id of Object.keys(r.maxCount)) {
    if (!(id in r.pieces)) {
      issues.push(err('BAD_MAX_COUNT', `maxCount references unknown piece id '${id}'`, []));
    }
  }

  for (const id of r.promotionTargets ?? []) {
    if (!(id in r.pieces)) {
      issues.push(err('BAD_PROMOTION_TARGET', `promotionTargets references unknown piece id '${id}'`, []));
    }
  }
  for (const id of r.promotionFallback ?? []) {
    if (!(id in r.pieces)) {
      issues.push(err('BAD_PROMOTION_TARGET', `promotionFallback references unknown piece id '${id}'`, []));
    }
  }

  return issues;
}

// ---- Profile validation ----

export function validateProfile(setup: string, r: Ruleset, opts?: { color?: Color }): Issue[] {
  const color: Color = opts?.color ?? 'w';
  const issues: Issue[] = [];

  let parsed: Setup;
  try {
    parsed = parseSetup(setup);
  } catch (e) {
    const msg = e instanceof SetupParseError ? e.message : String(e);
    issues.push(err('PARSE', `setup string failed to parse: ${msg}`, []));
    return issues;
  }

  if (parsed.version !== r.version) {
    issues.push(err('RULESET_VERSION', `setup ruleset version '${parsed.version}' does not match '${r.version}'`, []));
    return issues;
  }

  // UNKNOWN_PIECE
  const unknownSquares: number[] = [];
  const kingSquares: number[] = [];
  for (let ri = 0; ri < parsed.ranks.length; ri++) {
    for (let f = 0; f < 8; f++) {
      const id = parsed.ranks[ri]![f];
      if (id === null || id === undefined) continue;
      const sq = setupSquare(color, ri, f);
      if (id === KING_ID) { kingSquares.push(sq); continue; }
      if (!(id in r.pieces)) unknownSquares.push(sq);
    }
  }
  if (unknownSquares.length > 0) {
    issues.push(err('UNKNOWN_PIECE', `setup contains piece(s) not in ruleset '${r.version}'`, unknownSquares));
  }

  // KING_COUNT / KING_RANK
  const kingRankIdx = parsed.ranks.findIndex((row) => row.includes(KING_ID));
  if (kingSquares.length !== 1) {
    issues.push(err('KING_COUNT', `setup must have exactly one king, found ${kingSquares.length}`, kingSquares));
  } else if (kingRankIdx !== 0) {
    issues.push(err('KING_RANK', 'king must be on your back rank (rank 1, bottom row in the Builder)', kingSquares));
  }

  // OVER_BUDGET / MAX_COUNT
  const counts = setupCounts(parsed);
  const cost = setupCost(parsed, r);
  if (!Number.isNaN(cost) && cost > r.pool) {
    issues.push(err('OVER_BUDGET', `setup cost ${cost} exceeds pool ${r.pool}`, []));
  }
  for (const [id, cap] of Object.entries(r.maxCount)) {
    const n = counts[id] ?? 0;
    if (n > cap) {
      const squares: number[] = [];
      for (let ri = 0; ri < parsed.ranks.length; ri++) {
        for (let f = 0; f < 8; f++) {
          if (parsed.ranks[ri]![f] === id) squares.push(setupSquare(color, ri, f));
        }
      }
      issues.push(err('MAX_COUNT', `piece '${id}' count ${n} exceeds max ${cap}`, squares, { pieceId: id }));
    }
  }

  // PAWN_LAST_RANK — kept per spec even though unreachable in a 3-rank zone.
  const lastRankIdx = 7; // Relative promotion rank 8, NEVER the last setup-zone row.
  const pawnLastRankSquares: number[] = [];
  for (let f = 0; f < 8; f++) {
    const id = parsed.ranks[lastRankIdx]?.[f];
    if (id && id !== KING_ID && r.pieces[id]?.tier === 'pawn') {
      pawnLastRankSquares.push(setupSquare(color, lastRankIdx, f));
    }
  }
  if (pawnLastRankSquares.length > 0) {
    issues.push(err('PAWN_LAST_RANK', 'pawn-tier piece cannot be on the last rank', pawnLastRankSquares));
  }

  // KING_EXPOSED — only when exactly one king on rank 1
  if (kingSquares.length === 1 && kingRankIdx === 0) {
    const exposures = kingSafety(parsed, r, color);
    for (const exp of exposures) {
      issues.push(err('KING_EXPOSED', `king is exposed on the ${exp.line}`, exp.squares, {
        data: { kind: exp.kind, attackers: exp.attackers },
      }));
    }
  }

  return issues;
}

// ---- King safety ----

export type LineKind = 'file' | 'rank' | 'diagonal' | 'leap' | 'other';

export interface KingExposure {
  line: string;
  kind: LineKind;
  attackers: Array<{ pieceId: string; from: number }>;
  squares: number[];
}

function fileLetter(file: number): string {
  return String.fromCharCode(97 + file);
}

function squareName(sq: number): string {
  return `${fileLetter(sq % 8)}${(sq >> 3) + 1}`;
}

function lineKindAndLabel(fromSq: number, toSq: number): { kind: LineKind; line: string } {
  const fx = fromSq % 8;
  const fy = fromSq >> 3;
  const tx = toSq % 8;
  const ty = toSq >> 3;
  const dx = tx - fx;
  const dy = ty - fy;
  if (dx === 0 && dy !== 0) return { kind: 'file', line: `${fileLetter(fx)}-file` };
  if (dy === 0 && dx !== 0) return { kind: 'rank', line: `rank ${fy + 1}` };
  if (Math.abs(dx) === Math.abs(dy) && dx !== 0) {
    return { kind: 'diagonal', line: `${squareName(fromSq)}–${squareName(toSq)} diagonal` };
  }
  return { kind: 'leap', line: `a leap from ${squareName(fromSq)}` };
}

/**
 * King-safety check [impl.md "King-safety algorithm", spec.md "King safety"].
 * For each enemy-zone square and each ruleset piece (opposite color), test whether
 * a capture-capable vector from that square reaches the king, blocked only by the
 * player's own setup pieces (ranks 4-5 empty, no other enemy pieces).
 */
export function kingSafety(setup: Setup, r: Ruleset, color: Color = 'w'): KingExposure[] {
  const occ = new Array<boolean>(64).fill(false);
  let kingSq = -1;
  for (let ri = 0; ri < setup.ranks.length; ri++) {
    for (let f = 0; f < 8; f++) {
      const id = setup.ranks[ri]![f];
      if (id === null) continue;
      const sq = setupSquare(color, ri, f);
      occ[sq] = true;
      if (id === KING_ID) kingSq = sq;
    }
  }
  if (kingSq < 0) return [];

  const enemyColor: Color = color === 'w' ? 'b' : 'w';
  // Enemy zone: relative ranks 6-8. In absolute terms, that's the three ranks
  // furthest from the player's own rank 1, regardless of color.
  const enemyRankIdxs = color === 'w' ? [5, 6, 7] : [2, 1, 0];

  const hits: Array<{ pieceId: string; from: number; to: number }> = [];

  for (const rankIdx of enemyRankIdxs) {
    for (let f = 0; f < 8; f++) {
      const sq = rankIdx * 8 + f;
      if (occ[sq]) continue; // the enemy-zone square must be empty to place a test piece there
      for (const p of Object.values(r.pieces)) {
        const vectors = expandPiece(p, enemyColor).filter(canCapture);
        for (const v of vectors) {
          const sx = sq % 8;
          const sy = sq >> 3;
          if (v.path === 'leap') {
            const destX = sx + v.dx;
            const destY = sy + v.dy;
            if (destX < 0 || destX >= 8 || destY < 0 || destY >= 8) continue;
            const dest = destY * 8 + destX;
            if (dest === kingSq) hits.push({ pieceId: p.id, from: sq, to: kingSq });
            continue;
          }
          // slide: walk the ray, stop at the first occupied square or edge
          let cx = sx;
          let cy = sy;
          const maxSteps = v.range === Infinity ? 8 : v.range;
          for (let step = 1; step <= maxSteps; step++) {
            const nx = sx + v.dx * step;
            const ny = sy + v.dy * step;
            if (nx < 0 || nx >= 8 || ny < 0 || ny >= 8) break;
            const dest = ny * 8 + nx;
            if (dest === kingSq) { hits.push({ pieceId: p.id, from: sq, to: kingSq }); break; }
            if (occ[dest]) break;
          }
        }
      }
    }
  }

  // Group by line
  const groups = new Map<string, KingExposure>();
  for (const hit of hits) {
    const { kind, line } = lineKindAndLabel(hit.from, hit.to);
    const key = `${kind}:${line}`;
    let g = groups.get(key);
    if (!g) {
      g = { line, kind, attackers: [], squares: [kingSq] };
      groups.set(key, g);
    }
    g.attackers.push({ pieceId: hit.pieceId, from: hit.from });
    if (!g.squares.includes(hit.from)) g.squares.push(hit.from);
  }

  return [...groups.values()];
}
