import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { pieceSvg, badgeSvg, badgeMarks, resolveArt, KING_PIECE, pieceSignatures, BASELINE_Y, TIER_SIZE } from '../src/index.js';

const ruleset = getRuleset('2026.2')!;
const pieces = [...Object.values(ruleset.pieces), KING_PIECE];
const geometry = (p: typeof KING_PIECE) => pieceSvg(p).match(/<path d="([^"]+)"/)![1];

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
    const svgs = pieces.map(geometry);
    const unique = new Set(svgs);
    expect(unique.size).toBe(svgs.length);
  });

  it('is deterministic', () => {
    for (const p of pieces) {
      expect(pieceSvg(p)).toBe(pieceSvg(p));
    }
  });

  it('encodes range, direction and separate capture signatures', () => {
    const rook = pieceSignatures(ruleset.pieces.rook);
    const heron = pieceSignatures(ruleset.pieces.heron);
    expect(rook.body.ortho.forward.range).toBe('slide');
    expect(heron.body.ortho.forward.range).toBe('step');
    expect(heron.body.leap).toBe(true);
    expect(pieceSvg(ruleset.pieces.dragon)).not.toBe(pieceSvg(ruleset.pieces.queen));
    expect(rook.crest).toBeNull();
    const wraith = pieceSignatures(ruleset.pieces.wraith);
    expect(wraith.body.ortho.forward.present).toBe(true);
    expect(wraith.crest?.diag.fl.present).toBe(true);
    expect(pieceSignatures(ruleset.pieces.pawn).body.ortho.forward.present).toBe(true);
    expect(pieceSignatures(ruleset.pieces.berolina).body.diag.fl.present).toBe(true);
  });

  it('uses components, not library identities, to select geometry', () => {
    for (const p of pieces.filter(p => p.id !== 'king')) {
      expect(geometry({ ...p, id: 'new-piece', name: 'A new piece' })).toBe(geometry(p));
      expect(geometry({ ...p, components: [...p.components].reverse() })).toBe(geometry(p));
    }
  });

  it('keeps the outline inside the canvas, tier height and shared baseline', () => {
    for (const p of pieces) {
      const numbers = geometry(p).match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const xs = numbers.filter((_, i) => i % 2 === 0);
      const ys = numbers.filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(1.5);
      expect(Math.max(...xs)).toBeLessThanOrEqual(98.5);
      expect(Math.min(...ys)).toBe(BASELINE_Y - TIER_SIZE[p.tier].height);
      expect(Math.max(...ys)).toBe(BASELINE_Y);
      const outlinedHeight = Math.max(...ys) - Math.min(...ys) + 3;
      if (p.tier === 'pawn') {
        expect(outlinedHeight).toBeGreaterThanOrEqual(55);
        expect(outlinedHeight).toBeLessThanOrEqual(60);
      }
      expect(outlinedHeight).toBeLessThanOrEqual(91);
    }
  });

  it('preserves theme variables with optional standalone fallbacks', () => {
    const svg = pieceSvg(KING_PIECE, { fillFallback: '#fff', strokeFallback: '#111' });
    expect(svg).toContain('var(--piece-fill, #fff)');
    expect(svg).toContain('var(--piece-stroke, #111)');
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
