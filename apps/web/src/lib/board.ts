// Pure board math helpers (0..63, a1=0, h8=63), shared by all screen components.
export const FILES = 'abcdefgh';

export function fileOf(sq: number): number { return sq % 8; }
export function rankOf(sq: number): number { return sq >> 3; }
export function sqOf(file: number, rank: number): number { return rank * 8 + file; }
export function squareName(sq: number): string { return `${FILES[fileOf(sq)]}${rankOf(sq) + 1}`; }
export function parseSquareName(s: string): number {
  const file = FILES.indexOf(s[0]!);
  const rank = Number(s[1]) - 1;
  return sqOf(file, rank);
}

/** 8x8 flat index -> SVG pixel box, board drawn a1 at bottom-left when !flipped. */
export function squareXY(sq: number, size: number, flipped: boolean): { x: number; y: number } {
  const f = fileOf(sq);
  const r = rankOf(sq);
  const col = flipped ? 7 - f : f;
  const row = flipped ? r : 7 - r;
  return { x: col * size, y: row * size };
}

export function isLight(sq: number): boolean {
  return (fileOf(sq) + rankOf(sq)) % 2 === 1;
}
