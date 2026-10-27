// @takes/art: Procedural piece SVG + move-diagram badges.
import type { Piece, Vector } from '@takes/library';
import { expandPiece, canMove, canCapture } from '@takes/library';
import {
  BASELINE_Y,
  TIER_SIZE,
  pieceSignatures,
  type Tier,
  type Signature,
} from './motifs.js';

export { BASELINE_Y, TIER_SIZE, pieceMotifs, pieceSignatures, describePieceGrammar } from './motifs.js';
export type { Motif, Tier, TierSize, Signature } from './motifs.js';

const CX = 50; // canvas center x

/**
 * The engine-fixed king is not part of any ruleset's piece set (it's always
 * present, can never be bought/sold/promoted-to). We still want procedural
 * art for it: a standard one-square-any-direction signature (ortho all +
 * diag all, both step range 1), rendered through the exact same grammar as
 * every other piece, PLUS a connected crown/cross finial — the
 * one deliberate per-id exception in this module (see README).
 */
export const KING_PIECE: Piece = {
  id: 'king',
  name: 'King',
  glyph: 'K',
  tier: 'major',
  components: [
    { vec: [1, 0], sym: 'all', range: 1, path: 'slide', mode: 'both' },
    { vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
  ],
};

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

/** Component-driven silhouettes. All coordinates remain inside the tier envelope. */
function silhouette(tier: Tier, sig: Signature, capture: Signature | null, royal: boolean): string {
  const { height, width } = TIER_SIZE[tier];
  const bottom = BASELINE_Y;
  const top = bottom - height;
  const half = width / 2;
  const left = CX - half;
  const right = CX + half;
  const ortho = sig.ortho;
  const diagonal = sig.diag;
  const anyDiag = diagonal.fl.present || diagonal.fr.present || diagonal.bl.present || diagonal.br.present;
  const anyOrtho = ortho.forward.present || ortho.backward.present || ortho.left.present || ortho.right.present;
  const verticalSlide = ortho.forward.range === 'slide' && ortho.backward.range === 'slide';
  const y = (fraction: number) => top + height * fraction;
  let head: Array<[number, number]>;
  if (royal) {
    // Broad cross joined to a stepped crown; readable at 40px.
    head = [[38,y(.29)],[38,y(.19)],[46,y(.19)],[46,y(.12)],[39,y(.12)],[39,y(.055)],[46,y(.055)],[46,top],[54,top],[54,y(.055)],[61,y(.055)],[61,y(.12)],[54,y(.12)],[54,y(.19)],[62,y(.19)],[62,y(.29)]];
  } else if (anyOrtho && anyDiag) {
    // Three open crown points for combined orthogonal + diagonal sliders.
    head = [[34,y(.3)],[29,y(.04)],[42,y(.14)],[50,top],[58,y(.14)],[71,y(.04)],[66,y(.3)]];
  } else if (sig.leap) {
    head = [[36,y(.37)],[left,y(.08)],[43,y(.19)],[50,top],[57,y(.19)],[right,y(.08)],[64,y(.37)]];
  } else if (ortho.forward.range === 'slide' && !ortho.left.present && !ortho.right.present) {
    // Forward slider with a short backward step: long spear and broad guard.
    head = [[33,y(.4)],[33,y(.3)],[43,y(.3)],[43,y(.16)],[50,top],[57,y(.16)],[57,y(.3)],[67,y(.3)],[67,y(.4)]];
  } else if (ortho.forward.present && ortho.backward.present) {
    if (verticalSlide) {
      head = [[left,y(.3)],[left,top],[left+10,top],[left+10,y(.13)],[45,y(.13)],[45,top],[55,top],[55,y(.13)],[right-10,y(.13)],[right-10,top],[right,top],[right,y(.3)]];
    } else {
      // Long horizontal shelf, low central gate: sideways slide / vertical step.
      head = [[left,y(.28)],[left,y(.13)],[40,y(.13)],[40,top],[60,top],[60,y(.13)],[right,y(.13)],[right,y(.28)]];
    }
  } else if (anyDiag) {
    // Split mitre: diagonal motion has two peaks and a deep central slash.
    head = [[35,y(.34)],[32,y(.16)],[46,top],[46,y(.22)],[57,y(.02)],[68,y(.16)],[65,y(.34)]];
  } else if (ortho.forward.present) {
    head = [[35,y(.32)],[35,y(.19)],[50,top],[65,y(.19)],[65,y(.32)]];
  } else {
    head = [[35,y(.3)],[35,y(.1)],[65,y(.1)],[65,y(.3)]];
  }
  // Capture-only differences are integrated into the head, avoiding floating crests.
  if (capture && tier === 'pawn') {
    if (anyDiag) {
      // Berolina: diagonal movement fork around a straight capture spear.
      head = [[32,y(.34)],[28,y(.12)],[42,y(.23)],[46,y(.23)],[46,top],[54,top],[54,y(.23)],[58,y(.23)],[72,y(.12)],[68,y(.34)]];
    } else {
      // Pawn: a blunt forward head, flanked by diagonal capture shoulders.
      head = [[31,y(.34)],[31,y(.24)],[40,y(.24)],[40,y(.08)],[46,top],[54,top],[60,y(.08)],[60,y(.24)],[69,y(.24)],[69,y(.34)]];
    }
  } else if (capture && anyOrtho) {
    // Wraith: rook body carrying a tall split bishop crest.
    head = [[left,y(.34)],[left,y(.19)],[38,y(.19)],[38,y(.1)],[47,top],[47,y(.18)],[59,y(.025)],[64,y(.12)],[62,y(.19)],[right,y(.19)],[right,y(.34)]];
  }
  const neck = tier === 'rook' ? 21 : tier === 'pawn' ? 13 : 16;
  return polygon([
    [left,bottom],[left,y(.91)],[CX-neck,y(.72)],
    [CX-neck,y(.42)],...head,[CX+neck,y(.42)],
    [CX+neck,y(.72)],[right,y(.91)],[right,bottom],
  ]);
}

/** Deterministic, tier-scaled SVG; colors are supplied by the host theme. */
export function pieceSvg(p: Piece, opts: PieceSvgOpts = {}): string {
  const { body, crest } = pieceSignatures(p, 'w');
  const d = silhouette(p.tier as Tier, body, crest, p.id === 'king');
  const fill = opts.fillFallback ? `var(--piece-fill, ${escapeXml(opts.fillFallback)})` : 'var(--piece-fill)';
  const stroke = opts.strokeFallback ? `var(--piece-stroke, ${escapeXml(opts.strokeFallback)})` : 'var(--piece-stroke)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${escapeXml(p.name)}"><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/></svg>`;
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
