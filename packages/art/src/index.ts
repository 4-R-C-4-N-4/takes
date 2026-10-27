// @takes/art: Procedural piece SVG + move-diagram badges.
import type { Piece, Vector } from '@takes/library';
import { expandPiece, canMove, canCapture } from '@takes/library';
import { BASELINE_Y, TIER_SIZE, pieceMotifs, type Motif, type Tier } from './motifs.js';

export { BASELINE_Y, TIER_SIZE, pieceMotifs, describePieceGrammar } from './motifs.js';
export type { Motif, Tier, TierSize } from './motifs.js';

const CX = 50; // canvas center x

export interface PieceSvgOpts {
  /** CSS var fallbacks, used only to make standalone previews look reasonable. */
  fillFallback?: string;
  strokeFallback?: string;
}

function fmt(n: number): string {
  return Math.round(n * 1000) / 1000 + '';
}

/** Build a closed polygon path 'd' string from points. */
function polygon(points: Array<[number, number]>): string {
  const [x0, y0] = points[0]!;
  return (
    `M ${fmt(x0)} ${fmt(y0)} ` +
    points
      .slice(1)
      .map(([x, y]) => `L ${fmt(x)} ${fmt(y)}`)
      .join(' ') +
    ' Z'
  );
}

/** Crenellated (square, notched) top edge across [x1,x2] at height y, notch depth d. */
function crenellations(x1: number, x2: number, y: number, depth: number, teeth = 3): Array<[number, number]> {
  const w = x2 - x1;
  const seg = w / (teeth * 2);
  const pts: Array<[number, number]> = [];
  let x = x1;
  pts.push([x, y]);
  for (let i = 0; i < teeth; i++) {
    pts.push([x, y - depth]);
    pts.push([x + seg, y - depth]);
    x += seg;
    pts.push([x, y]);
    pts.push([x + seg, y]);
    x += seg;
  }
  return pts;
}

/** Mitred (angled, slashed) top edge: a single diagonal notch cut across the top. */
function mitreCut(x1: number, x2: number, yTop: number, yCut: number): Array<[number, number]> {
  const mid = (x1 + x2) / 2;
  return [
    [x1, yTop],
    [mid, yCut],
    [x2, yTop],
  ];
}

/** Build the body silhouette polygon for a piece given its tier box and body motifs. */
function buildBody(tier: Tier, body: Set<Motif>): string {
  const size = TIER_SIZE[tier];
  const halfW = size.width / 2;
  const yBase = BASELINE_Y;
  const yTop = yBase - size.height;
  const x1 = CX - halfW;
  const x2 = CX + halfW;

  // Base shape by tier: a trapezoid trunk widening toward the baseline.
  const footFlare = tier === 'rook' ? halfW * 0.25 : tier === 'pawn' ? halfW * 0.5 : halfW * 0.35;
  const neckY = yTop + size.height * (tier === 'rook' ? 0.35 : tier === 'major' ? 0.55 : 0.4);
  const neckHalfW = halfW * (tier === 'pawn' ? 0.55 : 0.6);

  const pts: Array<[number, number]> = [];
  // Left side, bottom to top.
  pts.push([x1 - footFlare, yBase]);
  pts.push([x1 - footFlare, yBase - size.height * 0.12]);
  pts.push([x1, neckY]);
  pts.push([CX - neckHalfW, neckY - size.height * 0.08]);

  // Top edge shaped by motif (leap > orthogonal > diagonal > forward-only > plain priority
  // for the primary silhouette cue; combos layer wings/crenellation together below).
  const topY = yTop + size.height * 0.1;
  if (body.has('orthogonal')) {
    pts.push(...crenellations(CX - neckHalfW, CX + neckHalfW, topY, size.height * 0.1, tier === 'rook' ? 3 : 2));
  } else if (body.has('diagonal')) {
    pts.push(...mitreCut(CX - neckHalfW, CX + neckHalfW, topY, yTop));
  } else if (body.has('forward-only')) {
    pts.push([CX - neckHalfW, topY], [CX, yTop], [CX + neckHalfW, topY]);
  } else {
    // plain / leap base top: rounded-ish via a shallow arc approximated with points
    pts.push([CX - neckHalfW, topY], [CX - neckHalfW * 0.4, yTop], [CX + neckHalfW * 0.4, yTop], [CX + neckHalfW, topY]);
  }

  pts.push([CX + neckHalfW, neckY - size.height * 0.08]);
  pts.push([x2, neckY]);
  pts.push([x1 + footFlare + (x2 - x1), yBase - size.height * 0.12]);
  pts.push([x2 + footFlare, yBase - size.height * 0.12]);
  pts.push([x2 + footFlare, yBase]);

  let d = polygon(pts);

  // Leap motif: add wings flaring from the neck, overlapping the body so the
  // silhouette stays a single connected shape.
  if (body.has('leap')) {
    const wingY = neckY - size.height * 0.02;
    const wingSpan = halfW * 0.9;
    const wingTipY = wingY - size.height * 0.22;
    d += ' ' + polygon([
      [CX - neckHalfW * 0.8, wingY],
      [CX - neckHalfW - wingSpan, wingTipY],
      [CX - neckHalfW * 0.3, wingY - size.height * 0.05],
    ]);
    d += ' ' + polygon([
      [CX + neckHalfW * 0.8, wingY],
      [CX + neckHalfW + wingSpan, wingTipY],
      [CX + neckHalfW * 0.3, wingY - size.height * 0.05],
    ]);
  }

  return d;
}

/** Base silhouette for the tier (foot + collar), independent of motif. */
function buildBase(tier: Tier): string {
  const size = TIER_SIZE[tier];
  const halfW = size.width / 2;
  const yBase = BASELINE_Y;
  const baseH = size.height * 0.1;
  const baseW = halfW * (tier === 'rook' ? 1.3 : 1.15);
  return polygon([
    [CX - baseW, yBase],
    [CX - baseW, yBase - baseH * 0.3],
    [CX + baseW, yBase - baseH * 0.3],
    [CX + baseW, yBase],
  ]);
}

/** Small crest sitting above the body, using capture-set motifs, when distinct from move-set. */
function buildCrest(tier: Tier, crest: Set<Motif>): string {
  const size = TIER_SIZE[tier];
  const halfW = size.width / 2;
  const yTop = BASELINE_Y - size.height;
  const crestW = halfW * 0.5;
  const crestH = size.height * 0.14;
  const y0 = yTop + size.height * 0.02;
  const yC = y0 - crestH;

  if (crest.has('orthogonal')) {
    const pts = crenellations(CX - crestW, CX + crestW, y0, crestH, 2);
    return polygon([[CX - crestW, y0], ...pts, [CX + crestW, y0]]);
  }
  if (crest.has('diagonal')) {
    return polygon(mitreCut(CX - crestW, CX + crestW, y0, yC));
  }
  if (crest.has('leap')) {
    return polygon([
      [CX - crestW * 1.4, y0],
      [CX, yC],
      [CX + crestW * 1.4, y0],
    ]);
  }
  if (crest.has('forward-only')) {
    return polygon([[CX - crestW * 0.8, y0], [CX, yC], [CX + crestW * 0.8, y0]]);
  }
  return polygon([[CX - crestW, y0], [CX - crestW * 0.3, yC], [CX + crestW * 0.3, yC], [CX + crestW, y0]]);
}

/**
 * Generate a procedural piece SVG. Deterministic: same piece -> byte-identical
 * output. Single fill + outline colored by CSS vars so one file serves both
 * colors; crest omitted when capture-set motifs match move-set motifs.
 */
export function pieceSvg(p: Piece, _opts: PieceSvgOpts = {}): string {
  const tier = p.tier as Tier;
  const { body, crest } = pieceMotifs(p, 'w');

  const bodyPath = buildBody(tier, body);
  const basePath = buildBase(tier);
  const crestPath = crest ? buildCrest(tier, crest) : '';

  const d = [basePath, bodyPath, crestPath].filter(Boolean).join(' ');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ` +
    `role="img" aria-label="${escapeXml(p.name)}">` +
    `<path d="${d}" fill="var(--piece-fill)" stroke="var(--piece-stroke)" ` +
    `stroke-width="3" stroke-linejoin="round" fill-rule="nonzero"/>` +
    `</svg>`
  );
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Move-diagram badge
// ---------------------------------------------------------------------------

export interface BadgeSvgOpts {
  /** Odd grid size, centered on the piece. Default 9 (range -4..4). */
  gridSize?: 7 | 9;
}

type MarkKind = 'quiet' | 'capture' | 'both' | 'slide-arrow' | 'leap' | 'rank2';

interface Mark {
  dx: number;
  dy: number;
  kind: MarkKind;
}

/** Compute marks for the badge grid from a piece's expanded (white-oriented) vectors. */
export function badgeMarks(p: Piece, gridSize: 7 | 9 = 9): Mark[] {
  const half = (gridSize - 1) / 2;
  const vectors = expandPiece(p, 'w');
  const marks: Mark[] = [];

  for (const v of vectors) {
    const canM = canMove(v);
    const canC = canCapture(v);
    const isSlider = v.path === 'slide' && (v.range === Infinity || v.range === null);
    const steps = isSlider ? half : Math.min(v.range, half);

    if (isSlider) {
      // Arrow to the edge: place the mark at the farthest on-grid cell in this direction.
      let dx = v.dx;
      let dy = v.dy;
      let s = 1;
      while (Math.abs(dx * (s + 1)) <= half && Math.abs(dy * (s + 1)) <= half) s++;
      marks.push({ dx: v.dx * s, dy: v.dy * s, kind: v.cond === 'rank2' ? 'rank2' : 'slide-arrow' });
      continue;
    }

    for (let s = 1; s <= steps; s++) {
      const dx = v.dx * s;
      const dy = v.dy * s;
      if (Math.abs(dx) > half || Math.abs(dy) > half) break;
      if (v.path === 'leap') {
        marks.push({ dx, dy, kind: 'leap' });
      } else if (v.cond === 'rank2') {
        marks.push({ dx, dy, kind: 'rank2' });
      } else if (canM && canC) {
        marks.push({ dx, dy, kind: 'both' });
      } else if (canC) {
        marks.push({ dx, dy, kind: 'capture' });
      } else {
        marks.push({ dx, dy, kind: 'quiet' });
      }
    }
  }

  return marks;
}

/**
 * Generate a move-diagram badge SVG: a small grid centered on the piece, owner
 * oriented forward-up, with quiet/capture/both/slider/leap/rank2 marks visually distinct.
 */
export function badgeSvg(p: Piece, opts: BadgeSvgOpts = {}): string {
  const gridSize = opts.gridSize ?? 9;
  const half = (gridSize - 1) / 2;
  const cell = 100 / gridSize;
  const marks = badgeMarks(p, gridSize);

  const gridToXY = (dx: number, dy: number) => {
    const col = half + dx;
    const row = half - dy; // forward (+dy) is up, so smaller row index
    return [col * cell + cell / 2, row * cell + cell / 2] as const;
  };

  const lines: string[] = [];
  // Grid lines.
  for (let i = 0; i <= gridSize; i++) {
    const p1 = i * cell;
    lines.push(`<line x1="${fmt(p1)}" y1="0" x2="${fmt(p1)}" y2="100" stroke="var(--piece-stroke)" stroke-width="0.3" opacity="0.25"/>`);
    lines.push(`<line x1="0" y1="${fmt(p1)}" x2="100" y2="${fmt(p1)}" stroke="var(--piece-stroke)" stroke-width="0.3" opacity="0.25"/>`);
  }

  // Piece square (center).
  const [cx, cy] = gridToXY(0, 0);
  lines.push(`<rect x="${fmt(cx - cell / 2)}" y="${fmt(cy - cell / 2)}" width="${fmt(cell)}" height="${fmt(cell)}" fill="var(--piece-fill)" opacity="0.3"/>`);
  lines.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(cell * 0.3)}" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1"/>`);

  for (const m of marks) {
    const [x, y] = gridToXY(m.dx, m.dy);
    if (m.kind === 'slide-arrow') {
      const [ox, oy] = gridToXY(0, 0);
      lines.push(
        `<line x1="${fmt(ox)}" y1="${fmt(oy)}" x2="${fmt(x)}" y2="${fmt(y)}" stroke="var(--piece-stroke)" stroke-width="1.2" marker-end="url(#arrowhead)"/>`,
      );
      continue;
    }
    if (m.kind === 'leap') {
      lines.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(cell * 0.18)}" fill="var(--piece-stroke)"/>`);
      continue;
    }
    if (m.kind === 'rank2') {
      lines.push(`<rect x="${fmt(x - cell * 0.22)}" y="${fmt(y - cell * 0.22)}" width="${fmt(cell * 0.44)}" height="${fmt(cell * 0.44)}" fill="none" stroke="var(--piece-stroke)" stroke-width="1" stroke-dasharray="2,1.5"/>`);
      continue;
    }
    if (m.kind === 'both') {
      lines.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(cell * 0.3)}" fill="none" stroke="var(--piece-stroke)" stroke-width="1.4"/>`);
      lines.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(cell * 0.12)}" fill="var(--piece-stroke)"/>`);
      continue;
    }
    if (m.kind === 'capture') {
      lines.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(cell * 0.3)}" fill="none" stroke="var(--piece-stroke)" stroke-width="1.4"/>`);
      continue;
    }
    // quiet
    lines.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(cell * 0.12)}" fill="var(--piece-stroke)"/>`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${escapeXml(p.name)} moves">` +
    `<defs><marker id="arrowhead" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">` +
    `<path d="M0,0 L4,2 L0,4 Z" fill="var(--piece-stroke)"/></marker></defs>` +
    `<rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--piece-stroke)" stroke-width="1"/>` +
    lines.join('') +
    `</svg>`
  );
}

/**
 * Pure helper implementing the "hand-made override" rule from docs/impl.md:
 * prefer `override` (e.g. loaded art.svg content) when provided, else the
 * procedural SVG.
 */
export function resolveArt(_id: string, override: string | undefined | null, procedural: string): string {
  return override && override.length > 0 ? override : procedural;
}
