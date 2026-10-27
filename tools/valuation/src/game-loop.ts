/** Plays one self-play game: Fairy-Stockfish proposes moves; the Takes engine is sole game-end
 * authority [D12]. Any FSF move the Takes engine rejects is logged as a parity bug (should be zero). */
import { createGame, type Game } from '@takes/engine';
import type { Color, Ruleset } from '@takes/library';
import type { SearchResult } from './uci.js';

/** Structural subset of FsfProcess needed to play a game; lets tests use a fake engine. */
export interface SearchEngine {
  goNodes(fen: string, nodes: number): Promise<SearchResult>;
}

export interface AdjudicationConfig {
  /** |eval| above this cp, agreed by both sides for this many consecutive own-moves, ends the game decisively. */
  decisiveCp: number;
  decisiveStreak: number;
  /** |eval| below this cp for this many plies (after minPly) ends the game as a draw. */
  drawCp: number;
  drawPlies: number;
  drawMinPly: number;
}

export const DEFAULT_ADJUDICATION: AdjudicationConfig = {
  decisiveCp: 1000,
  decisiveStreak: 4,
  drawCp: 10,
  drawPlies: 20,
  drawMinPly: 80,
};

export interface GameOutcome {
  /** +1 white win, -1 black win, 0 draw. */
  result: 1 | 0 | -1;
  plies: number;
  reason: string;
  parityBugs: string[];
}

export async function playGame(
  fsf: SearchEngine,
  ruleset: Ruleset,
  whiteSetup: string,
  blackSetup: string,
  nodes: number,
  adj: AdjudicationConfig = DEFAULT_ADJUDICATION,
): Promise<GameOutcome> {
  const game: Game = createGame(ruleset, whiteSetup, blackSetup);
  const parityBugs: string[] = [];
  let decisiveStreakCount = 0;
  let decisiveSign = 0;
  let drawStreakCount = 0;

  for (;;) {
    const status = game.status();
    if (status.result !== '*') {
      const result = status.result === '1-0' ? 1 : status.result === '0-1' ? -1 : 0;
      return { result, plies: game.ply(), reason: status.reason ?? status.result, parityBugs };
    }
    if (game.ply() >= ruleset.maxPlies) {
      return { result: 0, plies: game.ply(), reason: 'move-cap', parityBugs };
    }

    const stm: Color = game.sideToMove();
    const { bestmove, scoreCp } = await fsf.goNodes(game.toFEN(), nodes);
    if (!bestmove) {
      // FSF sees no legal move; defer to the Takes engine's own status on the next loop iteration
      // by forcing a stalemate/checkmate read — if Takes still thinks moves exist, that's a parity bug.
      if (game.legalMoves().length > 0) parityBugs.push(`fsf returned no bestmove at ply ${game.ply()} but Takes has legal moves`);
      return { result: game.inCheck() ? (stm === 'w' ? -1 : 1) : 0, plies: game.ply(), reason: 'fsf-no-move', parityBugs };
    }
    const move = game.parseUci(bestmove);
    if (!move) {
      parityBugs.push(`ply ${game.ply()} (${stm}): FSF played '${bestmove}', Takes engine rejected it as illegal`);
      // Abort this game rather than silently miscounting it.
      return { result: 0, plies: game.ply(), reason: 'parity-bug-abort', parityBugs };
    }
    game.make(move);

    if (scoreCp !== null) {
      const whiteCp = stm === 'w' ? scoreCp : -scoreCp;
      if (Math.abs(whiteCp) > adj.decisiveCp) {
        const sign = Math.sign(whiteCp);
        decisiveStreakCount = sign === decisiveSign ? decisiveStreakCount + 1 : 1;
        decisiveSign = sign;
        if (decisiveStreakCount >= adj.decisiveStreak) {
          return { result: sign > 0 ? 1 : -1, plies: game.ply(), reason: 'adjudicated-decisive', parityBugs };
        }
      } else {
        decisiveStreakCount = 0;
      }
      if (game.ply() >= adj.drawMinPly && Math.abs(whiteCp) < adj.drawCp) {
        drawStreakCount++;
        if (drawStreakCount >= adj.drawPlies) {
          return { result: 0, plies: game.ply(), reason: 'adjudicated-draw', parityBugs };
        }
      } else {
        drawStreakCount = 0;
      }
    }
  }
}
