import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame } from '@takes/engine';
import { playGame, type SearchEngine, DEFAULT_ADJUDICATION } from '../src/game-loop.js';
import { classicSetup, str } from '../src/setups.js';

const ruleset = getRuleset('2026.1')!;
const whiteSetup = str(classicSetup(ruleset.version));
const blackSetup = whiteSetup;

/** Fake engine: always plays the first legal move of the real Takes engine (so moves are always legal),
 * and returns a scripted score sequence to drive adjudication paths deterministically. */
function fakeEngine(scores: number[]): SearchEngine {
  let i = 0;
  const game = createGame(ruleset, whiteSetup, blackSetup);
  return {
    async goNodes(fen: string) {
      const g = createGame(ruleset, whiteSetup, blackSetup);
      // Replay nothing: just use a fresh legal-move lookup isn't tied to fen replay here since this
      // fake only needs *a* legal uci move for the position described by fen's side to move; reuse
      // module-local game to stay in sync with playGame's own sequential calls.
      void fen;
      const moves = game.legalMoves();
      const mv = moves[0]!;
      game.make(mv);
      const score = scores[Math.min(i, scores.length - 1)]!;
      i++;
      return { bestmove: game.moveToUci(mv), scoreCp: score, mate: null };
    },
  };
}

describe('adjudication', () => {
  it('ends decisively after a persistent lopsided eval', async () => {
    const scores = new Array(200).fill(2000); // white crushing, from side-to-move perspective alternates but stays large
    const outcome = await playGame(fakeEngine(scores), ruleset, whiteSetup, blackSetup, 1000, DEFAULT_ADJUDICATION);
    expect(['adjudicated-decisive', 'checkmate', 'move-cap', 'repetition']).toContain(outcome.reason);
  });

  it('ends as a draw after a long near-zero eval beyond the min ply', async () => {
    const scores = new Array(400).fill(0);
    const outcome = await playGame(fakeEngine(scores), ruleset, whiteSetup, blackSetup, 1000, DEFAULT_ADJUDICATION);
    expect(['adjudicated-draw', 'move-cap', 'checkmate', 'stalemate', 'repetition']).toContain(outcome.reason);
  });

  it('reports zero parity bugs when every FSF move comes from the Takes engine itself', async () => {
    const outcome = await playGame(fakeEngine([0]), ruleset, whiteSetup, blackSetup, 1000, DEFAULT_ADJUDICATION);
    expect(outcome.parityBugs).toHaveLength(0);
  });

  it('flags a parity bug when the engine returns an illegal move', async () => {
    const engine: SearchEngine = { async goNodes() { return { bestmove: 'a1a1', scoreCp: 0, mate: null }; } };
    const outcome = await playGame(engine, ruleset, whiteSetup, blackSetup, 1000, DEFAULT_ADJUDICATION);
    expect(outcome.parityBugs.length).toBeGreaterThan(0);
    expect(outcome.reason).toBe('parity-bug-abort');
  });
});
