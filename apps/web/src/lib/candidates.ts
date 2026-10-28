// Candidate review: screened catalog pieces (docs/catalog/screened.json), review verdicts, and a
// sandbox ruleset so a candidate can be test-driven in hotseat without publishing it.
import type { Piece, Ruleset, Tier } from '@takes/library';
import { KING_ID, VANILLA_PAWN_ID } from '@takes/library';

export interface CandidateMetrics {
  games: number; excluded: number; score: number; scoreCI: [number, number];
  movesPerGame: number; capturesPerGame: number; checksPerGame: number; forksPerGame: number;
  survival: number; finalAttack: number; avgPlies: number; decisive: number;
}
export interface Candidate {
  key: string; piece: Piece; tier: Tier; betza: string; families: string[];
  profile: { mobilityAvg: number; colorBound: boolean; canRetreat: boolean; nearestLibraryId: string; nearestLibraryDistance: number };
  metrics: CandidateMetrics; replaced: string; stage: 'B' | 'C'; shortlisted: boolean;
}
export interface ScreenedData { nullScore: Record<string, number>; candidates: Candidate[] }

/** JSON has no Infinity: unbounded slide ranges arrive as null and must be restored. */
export function restoreInfinity<T extends { piece: Piece }>(items: T[]): T[] {
  for (const c of items) for (const comp of c.piece.components) if ((comp.range as number | null) === null) comp.range = Infinity;
  return items;
}

/** Strength relative to the slot's null control (the replaced piece injected as a custom piece). */
export function deltaVsNull(c: Candidate, nullScore: Record<string, number>): number {
  return c.metrics.score - (nullScore[c.tier] ?? 0.5);
}

export type Verdict = 'keep' | 'maybe' | 'reject';
export interface Review { verdict?: Verdict; note?: string; name?: string; at: string }
const REVIEW_KEY = 'takes.review.v1';

export function loadReviews(storage: Pick<Storage, 'getItem'> = localStorage): Record<string, Review> {
  try { return JSON.parse(storage.getItem(REVIEW_KEY) ?? '{}') as Record<string, Review>; } catch { return {}; }
}
export function saveReview(key: string, patch: Partial<Review>, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): Record<string, Review> {
  const all = loadReviews(storage);
  all[key] = { ...all[key], ...patch, at: new Date().toISOString() };
  try { storage.setItem(REVIEW_KEY, JSON.stringify(all)); } catch { /* storage full/blocked: keep in memory */ }
  return all;
}
/** Export for the orchestrator: betza + verdict + note per reviewed candidate. */
export function exportReviews(reviews: Record<string, Review>, candidates: Candidate[]): string {
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const rows = Object.entries(reviews).map(([key, r]) => ({ key, betza: byKey.get(key)?.betza, tier: byKey.get(key)?.tier, ...r }));
  return JSON.stringify(rows, null, 2);
}

const SANDBOX_GLYPH = 'Z';
export const SANDBOX_ID = 'candidate';

/** Current ruleset plus the candidate (id 'candidate', glyph Z), for hotseat test drives. */
export function sandboxRuleset(base: Ruleset, c: Candidate): Ruleset {
  const piece: Piece = { ...c.piece, id: SANDBOX_ID, name: `Candidate ${c.betza}`, glyph: SANDBOX_GLYPH, tier: c.tier };
  return {
    ...base,
    version: `${base.version}+candidate`,
    pieces: { ...base.pieces, [SANDBOX_ID]: piece },
    costs: { ...base.costs, [SANDBOX_ID]: 0 },
  };
}

/** Vanilla army with the candidate in its tier's slot(s): the same substitution the screen used. */
export function sandboxSetup(version: string, tier: Tier): string {
  const back = ['rook', 'knight', 'bishop', 'queen', KING_ID, 'bishop', 'knight', 'rook'];
  const pawns = Array<string>(8).fill(VANILLA_PAWN_ID);
  const slot: Record<Tier, [number, number][]> = {
    pawn: [[1, 3], [1, 4]], minor: [[0, 1], [0, 6]], rook: [[0, 0], [0, 7]], major: [[0, 3]],
  };
  const ranks = [back, pawns];
  for (const [r, f] of slot[tier]) ranks[r]![f] = SANDBOX_ID;
  const enc = (row: string[]) => row.map((id) => ({ rook: 'R', knight: 'N', bishop: 'B', queen: 'Q', [KING_ID]: 'K', [VANILLA_PAWN_ID]: 'P' } as Record<string, string>)[id] ?? `{${id}}`).join('');
  return `${version}:${enc(back)}/${enc(pawns)}/8`;
}
