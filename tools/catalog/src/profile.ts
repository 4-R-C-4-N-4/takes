/** Static profile computation [docs/catalog/PLAN.md step 3]. */
import type { Piece, Ruleset, Vector } from '@takes/library';
import { expandPiece, canMove, canCapture } from '@takes/library';
import type { StaticProfile } from './types.js';

const CENTER = [27, 28, 35, 36]; // d4,e4,d5,e5 (0-indexed, a1=0)
const CORNERS = [0, 7, 56, 63];

function destinationsFrom(vectors: Vector[], from: number): { quiet: number; capture: number } {
  const fx = from % 8;
  const fy = Math.floor(from / 8);
  let quiet = 0;
  let capture = 0;
  for (const v of vectors) {
    const steps = v.range === Infinity ? 8 : v.range;
    for (let n = 1; n <= steps; n++) {
      const nx = fx + v.dx * n;
      const ny = fy + v.dy * n;
      if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
      if (v.mode !== 'capture') quiet++;
      if (v.mode !== 'move') capture++;
    }
  }
  return { quiet, capture };
}

function avgOver(vectors: Vector[], squares: number[]): { mobility: number; capture: number } {
  let mob = 0;
  let cap = 0;
  for (const sq of squares) {
    const d = destinationsFrom(vectors, sq);
    mob += d.quiet + d.capture;
    cap += d.capture;
  }
  return { mobility: mob / squares.length, capture: cap / squares.length };
}

export function emptyBoardMobility(vectors: Vector[]): { avg: number; center: number; corner: number; captureAvg: number } {
  const all = Array.from({ length: 64 }, (_, i) => i);
  const a = avgOver(vectors, all);
  const c = avgOver(vectors, CENTER);
  const k = avgOver(vectors, CORNERS);
  return { avg: a.mobility, center: c.mobility, corner: k.mobility, captureAvg: a.capture };
}

/** Color-bound: every expanded White vector has dx+dy even (stays on one square color). */
export function isColorBound(vectors: Vector[]): boolean {
  if (vectors.length === 0) return false;
  return vectors.every((v) => (v.dx + v.dy) % 2 === 0);
}

export function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : 1 - inter / union;
}

function vecKeySet(vectors: Vector[]): Set<string> {
  return new Set(vectors.map((v) => `${v.dx},${v.dy},${v.range === Infinity ? 'inf' : v.range},${v.path},${v.mode}`));
}

export function nearestLibraryPiece(piece: Piece, ruleset: Ruleset): { id: string; distance: number } {
  const mine = vecKeySet(expandPiece(piece, 'w'));
  let bestId = '';
  let bestDist = Infinity;
  for (const lp of Object.values(ruleset.pieces)) {
    const theirs = vecKeySet(expandPiece(lp, 'w'));
    const d = jaccardDistance(mine, theirs);
    if (d < bestDist) { bestDist = d; bestId = lp.id; }
  }
  return { id: bestId, distance: bestDist === Infinity ? 1 : bestDist };
}

export function buildProfile(piece: Piece, ruleset: Ruleset): StaticProfile {
  const vectors = expandPiece(piece, 'w');
  const mob = emptyBoardMobility(vectors);
  const nearest = nearestLibraryPiece(piece, ruleset);
  const moveVectors = vectors.filter(canMove);
  const captureVectors = vectors.filter(canCapture);
  const moveKey = (vs: Vector[]) => vs.map((v) => `${v.dx},${v.dy},${v.range}`).sort().join(';');
  return {
    mobilityAvg: mob.avg,
    mobilityCenter: mob.center,
    mobilityCorner: mob.corner,
    captureAvg: mob.captureAvg,
    colorBound: isColorBound(vectors),
    canRetreat: vectors.some((v) => v.dy < 0),
    canSidestep: vectors.some((v) => v.dy === 0),
    hasLeap: vectors.some((v) => v.path === 'leap'),
    hasSlide: vectors.some((v) => v.path === 'slide'),
    splitMoveCapture: moveKey(moveVectors) !== moveKey(captureVectors),
    nearestLibraryId: nearest.id,
    nearestLibraryDistance: nearest.distance,
  };
}
