import { describe, expect, it } from 'vitest';
import { getRuleset, parseSetup } from '@takes/library';
import { createGame } from '@takes/engine';
import { restoreInfinity, deltaVsNull, saveReview, loadReviews, exportReviews, sandboxRuleset, sandboxSetup, SANDBOX_ID, type Candidate } from './candidates.js';

const base = getRuleset('2026.2')!;
const cand = (over: Partial<Candidate> = {}): Candidate => restoreInfinity<Candidate>([{
  key: 'k1', betza: 'BcN', tier: 'minor', families: ['slide-leap'], replaced: 'knight', stage: 'C', shortlisted: true,
  piece: { id: 'c_x', name: 'x', glyph: 'C', tier: 'minor', components: [
    { vec: [1, 1], sym: 'all', range: null as unknown as number, path: 'slide', mode: 'both' },
    { vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'capture' },
  ] },
  profile: { mobilityAvg: 9, colorBound: false, canRetreat: true, nearestLibraryId: 'bishop', nearestLibraryDistance: 0.5 },
  metrics: { games: 160, excluded: 0, score: 0.63, scoreCI: [0.55, 0.7], movesPerGame: 4, capturesPerGame: 1, checksPerGame: 0.5, forksPerGame: 0.4, survival: 0.4, finalAttack: 0.1, avgPlies: 90, decisive: 0.8 },
  ...over,
} as Candidate])[0]!;

function memStorage() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; }

describe('candidate review', () => {
  it('restores unbounded slides from JSON null', () => {
    expect(cand().piece.components[0]!.range).toBe(Infinity);
  });
  it('scores against the slot null control', () => {
    expect(deltaVsNull(cand(), { minor: 0.32 })).toBeCloseTo(0.31);
  });
  it('stores and exports verdicts', () => {
    const s = memStorage();
    saveReview('k1', { verdict: 'keep', note: 'fun forks' }, s);
    saveReview('k1', { name: 'Hydra' }, s);
    const r = loadReviews(s);
    expect(r.k1).toMatchObject({ verdict: 'keep', note: 'fun forks', name: 'Hydra' });
    expect(JSON.parse(exportReviews(r, [cand()]))[0]).toMatchObject({ betza: 'BcN', verdict: 'keep', name: 'Hydra' });
  });
  it('builds a playable sandbox game with the candidate in its tier slot', () => {
    for (const tier of ['pawn', 'minor', 'rook', 'major'] as const) {
      const c = cand({ tier });
      const r = sandboxRuleset(base, c);
      const setup = sandboxSetup(r.version, tier);
      expect(parseSetup(setup).ranks.flat().filter((id) => id === SANDBOX_ID).length).toBeGreaterThan(0);
      const g = createGame(r, setup, `${r.version}:RNBQKBNR/PPPPPPPP/8`);
      expect(g.legalMoves().length).toBeGreaterThan(0);
    }
  });
});
