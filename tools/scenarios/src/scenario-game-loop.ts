/** Scenario game loop: plays one game with the Takes engine as sole referee [D12], same structure
 * as @takes/valuation's playGame (attribution: adapted from tools/valuation/src/game-loop.ts),
 * but also tracks per-candidate-ply metrics (moves/captures/checks/forks/finalAttack windows)
 * needed to fill ScenarioMetrics [req. 2]. Parity aborts are excluded, never scored as draws. */
import { createGame, type Game } from '@takes/engine';
import type { Color, Ruleset } from '@takes/library';
import type { SearchEngine, AdjudicationConfig, GameOutcome } from '@takes/valuation';
import { DEFAULT_ADJUDICATION } from '@takes/valuation';
import { observeCandidatePly } from './metrics.js';

export interface CandidateGameResult extends GameOutcome {
  candidateColor: Color;
  candidateMoves: number;
  candidateCaptures: number;
  candidateChecks: number;
  candidateForks: number;
  candidateAlive: boolean;
  /** True if, within the last 6 plies of a decisive game, the candidate attacked the losing king's zone. */
  finalAttack: boolean;
}

function findCandidateSquare(game: Game, candidateId: string, color: Color): number | null {
  const board = game.board();
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p && p.color === color && p.pieceId === candidateId) return s;
  }
  return null;
}

export async function playScenarioGame(
  fsf: SearchEngine,
  ruleset: Ruleset,
  whiteSetup: string,
  blackSetup: string,
  candidateId: string,
  candidateColor: Color,
  nodes: number,
  adj: AdjudicationConfig = DEFAULT_ADJUDICATION,
): Promise<CandidateGameResult> {
  const game: Game = createGame(ruleset, whiteSetup, blackSetup);
  const parityBugs: string[] = [];
  const parityBugDetails: GameOutcome['parityBugDetails'] = [];
  let decisiveStreakCount = 0;
  let decisiveSign = 0;
  let drawStreakCount = 0;

  let candidateMoves = 0, candidateCaptures = 0, candidateChecks = 0, candidateForks = 0;
  const kingZoneHitPlies: number[] = [];

  const finish = (result: 1 | 0 | -1, reason: string, excluded: boolean): CandidateGameResult => {
    const alive = findCandidateSquare(game, candidateId, candidateColor) !== null;
    const plies = game.ply();
    let finalAttack = false;
    if (!excluded && result !== 0) {
      const losingColor: Color = result === 1 ? 'b' : 'w';
      if (losingColor === (candidateColor === 'w' ? 'b' : 'w')) {
        // candidate's side won; finalAttack only applies when candidate contributed to a decisive game
        finalAttack = kingZoneHitPlies.some((p) => plies - p <= 6);
      }
    }
    return {
      result, plies, reason, parityBugs, parityBugDetails, excluded,
      candidateColor, candidateMoves, candidateCaptures, candidateChecks, candidateForks,
      candidateAlive: alive, finalAttack,
    };
  };

  for (;;) {
    const status = game.status();
    if (status.result !== '*') {
      const result = status.result === '1-0' ? 1 : status.result === '0-1' ? -1 : 0;
      return finish(result, status.reason ?? status.result, false);
    }
    if (game.ply() >= ruleset.maxPlies) return finish(0, 'move-cap', false);

    const stm: Color = game.sideToMove();
    const fenBefore = game.toFEN();
    const { bestmove, scoreCp } = await fsf.goNodes(fenBefore, nodes);
    if (!bestmove) {
      if (game.legalMoves().length > 0) {
        parityBugs.push(`fsf returned no bestmove at ply ${game.ply()} but Takes has legal moves`);
        parityBugDetails.push({ fenBefore, fsfMove: '(none)', engineLegalMoves: game.legalMoves().map((m) => game.moveToUci(m)) });
        return finish(0, 'fsf-no-move-parity-bug', true);
      }
      return finish(game.inCheck() ? (stm === 'w' ? -1 : 1) : 0, 'fsf-no-move', false);
    }
    const move = game.parseUci(bestmove);
    if (!move) {
      parityBugs.push(`ply ${game.ply()} (${stm}): FSF played '${bestmove}', Takes engine rejected it as illegal`);
      parityBugDetails.push({ fenBefore, fsfMove: bestmove, engineLegalMoves: game.legalMoves().map((m) => game.moveToUci(m)) });
      return finish(0, 'parity-bug-abort', true);
    }
    const isCandidateMove = stm === candidateColor && findCandidateSquare(game, candidateId, candidateColor) === move.from;
    game.make(move);

    if (isCandidateMove) {
      candidateMoves++;
      if (move.captured) candidateCaptures++;
      const sqAfter = findCandidateSquare(game, candidateId, candidateColor);
      const obs = observeCandidatePly(ruleset, candidateId, candidateColor, game, move.captured, sqAfter);
      if (obs.isCapture) { /* counted above via move.captured */ }
      if (obs.isCheck) candidateChecks++;
      if (obs.isFork) candidateForks++;
      if (obs.attacksEnemyKingZone) kingZoneHitPlies.push(game.ply());
    }

    if (scoreCp !== null) {
      const whiteCp = stm === 'w' ? scoreCp : -scoreCp;
      if (Math.abs(whiteCp) > adj.decisiveCp) {
        const sign = Math.sign(whiteCp);
        decisiveStreakCount = sign === decisiveSign ? decisiveStreakCount + 1 : 1;
        decisiveSign = sign;
        if (decisiveStreakCount >= adj.decisiveStreak) return finish(sign > 0 ? 1 : -1, 'adjudicated-decisive', false);
      } else {
        decisiveStreakCount = 0;
      }
      if (game.ply() >= adj.drawMinPly && Math.abs(whiteCp) < adj.drawCp) {
        drawStreakCount++;
        if (drawStreakCount >= adj.drawPlies) return finish(0, 'adjudicated-draw', false);
      } else {
        drawStreakCount = 0;
      }
    }
  }
}
