import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { pieceSvg, badgeSvg, badgeMarks, resolveArt } from '../src/index.js';

const ruleset = getRuleset('2026.1')!;
const pieces = Object.values(ruleset.pieces);

function isWellFormedXml(s: string): boolean {
  // Lightweight well-formedness check: every opening tag has a matching close
  // or is self-closing, and tags are properly nested (stack-based).
  const tagRe = /<\/?([a-zA-Z][\w:-]*)(\s[^>]*)?\/?>/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = tagRe.exec(s))) {
    count++;
    const full = m[0];
    const name = m[1];
    if (full.startsWith('</')) {
      const top = stack.pop();
      if (top !== name) return false;
    } else if (!full.endsWith('/>')) {
      stack.push(name);
    }
  }
  return count > 0 && stack.length === 0;
}

describe('pieceSvg', () => {
  it('produces a well-formed, valid SVG for every library piece', () => {
    for (const p of pieces) {
      const svg = pieceSvg(p);
      expect(isWellFormedXml(svg)).toBe(true);
      expect(svg).toContain('viewBox="0 0 100 100"');
      expect(svg).toContain('var(--piece-fill)');
      expect(svg).toContain('var(--piece-stroke)');
      expect(svg).not.toMatch(/fill="#/);
      expect(svg).not.toMatch(/stroke="#/);
    }
  });

  it('produces distinct SVGs for distinct pieces', () => {
    const svgs = pieces.map((p) => pieceSvg(p));
    const unique = new Set(svgs);
    expect(unique.size).toBe(svgs.length);
  });

  it('is deterministic', () => {
    for (const p of pieces) {
      expect(pieceSvg(p)).toBe(pieceSvg(p));
    }
  });

  it('gives the wraith a crest (capture != move) and the rook none', () => {
    const wraith = ruleset.pieces.wraith;
    const rook = ruleset.pieces.rook;
    expect(wraith).toBeDefined();
    expect(rook).toBeDefined();
    const wraithSvg = pieceSvg(wraith);
    const rookSvg = pieceSvg(rook);
    // Wraith's path data should contain more sub-path segments (base+body+crest)
    // than the rook's (base+body only) since the crest is an extra closed polygon.
    const countMoves = (svg: string) => (svg.match(/ M /g) || []).length + (svg.match(/^.*?d="M /) ? 1 : 0);
    const wraithSegments = (wraithSvg.match(/Z/g) || []).length;
    const rookSegments = (rookSvg.match(/Z/g) || []).length;
    expect(wraithSegments).toBeGreaterThan(rookSegments);
  });
});

describe('badgeSvg', () => {
  it('produces a valid badge SVG for every library piece', () => {
    for (const p of pieces) {
      const svg = badgeSvg(p);
      expect(isWellFormedXml(svg)).toBe(true);
      expect(svg).toContain('viewBox="0 0 100 100"');
      expect(svg).toContain('var(--piece-fill)');
      expect(svg).toContain('var(--piece-stroke)');
    }
  });

  it('matches expanded vectors for the knight (8 leaps)', () => {
    const knight = ruleset.pieces.knight;
    const marks = badgeMarks(knight, 9);
    const leaps = marks.filter((m) => m.kind === 'leap');
    expect(leaps.length).toBe(8);
  });

  it('distinguishes quiet-only, capture-only and both marks for the pawn', () => {
    const pawn = ruleset.pieces.pawn;
    const marks = badgeMarks(pawn, 9);
    const kinds = new Set(marks.map((m) => m.kind));
    // pawn: forward move (quiet, rank2 double step), diagonal capture-only
    expect(kinds.has('quiet')).toBe(true);
    expect(kinds.has('capture')).toBe(true);
    expect(kinds.has('rank2')).toBe(true);
    expect(kinds.has('both')).toBe(false);
  });

  it('shows the rook as slider arrows to the grid edge', () => {
    const rook = ruleset.pieces.rook;
    const marks = badgeMarks(rook, 9);
    expect(marks.every((m) => m.kind === 'slide-arrow')).toBe(true);
    expect(marks.length).toBe(4);
  });
});

describe('resolveArt', () => {
  it('prefers the override when present', () => {
    expect(resolveArt('x', '<svg>override</svg>', '<svg>procedural</svg>')).toBe('<svg>override</svg>');
  });
  it('falls back to procedural when no override', () => {
    expect(resolveArt('x', undefined, '<svg>procedural</svg>')).toBe('<svg>procedural</svg>');
    expect(resolveArt('x', '', '<svg>procedural</svg>')).toBe('<svg>procedural</svg>');
  });
});
