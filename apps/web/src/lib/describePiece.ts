// Pure plain-language description of a piece's movement, built from its components.
// Used by the Library and Lab inspectors. Keep this free of DOM/Svelte so it stays unit-testable.
import type { Component, Piece } from '@takes/library';

function directionLabel(dx: number, dy: number): string {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === ay) return 'diagonally';
  if (dx === 0) return 'orthogonally';
  if (dy === 0) return 'orthogonally';
  return 'in an L-shape';
}

function shapeKind(c: Component): 'orthogonal' | 'diagonal' | 'knight' {
  const [dx, dy] = c.vec;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (dx === 0 || dy === 0) return 'orthogonal';
  if (ax === ay) return 'diagonal';
  return 'knight';
}

function rangeWord(c: Component): string {
  if (c.range === Infinity) return c.path === 'slide' ? 'any distance' : 'any distance (leaping)';
  if (c.range === 1) return c.path === 'leap' ? 'one square' : 'one square';
  return `up to ${c.range} squares`;
}

function verbFor(c: Component): string {
  if (c.path === 'slide') return 'Slides';
  if (shapeKind(c) === 'knight') return 'Leaps';
  if (c.range === 1) return 'Steps';
  return 'Leaps';
}

function modeSuffix(c: Component): string {
  if (c.mode === 'move') return ', without capturing';
  if (c.mode === 'capture') return ', capture only';
  return '';
}

function condSuffix(c: Component): string {
  return c.cond === 'rank2' ? ', from its starting square' : '';
}

function symWord(c: Component): string {
  if (c.sym === 'all') return '';
  const words: Record<string, string> = {
    f: 'forward', b: 'backward', l: 'left', r: 'right',
    fl: 'diagonally forward-left', fr: 'diagonally forward-right',
    bl: 'diagonally backward-left', br: 'diagonally backward-right',
  };
  const dirs = c.sym.map((d) => words[d] ?? d);
  return ` ${dirs.join(' and ')} only`;
}

/** One plain sentence per component, e.g. "Slides any distance orthogonally." */
export function describeComponent(c: Component): string {
  const kind = shapeKind(c);
  const verb = verbFor(c);
  const over = c.path === 'leap' && c.range > 1 ? ', over pieces' : '';
  if (kind === 'knight') {
    return `${verb} in an L-shape (knight move)${symWord(c)}${modeSuffix(c)}${condSuffix(c)}.`;
  }
  const dist = rangeWord(c);
  const dir = directionLabel(...c.vec);
  return `${verb} ${dist} ${dir}${symWord(c)}${over}${modeSuffix(c)}${condSuffix(c)}.`;
}

/** Full plain-language movement description for a piece: one sentence per component. */
export function describePiece(piece: Piece): string {
  if (piece.components.length === 0) return 'Does not move.';
  return piece.components.map(describeComponent).join(' ');
}
