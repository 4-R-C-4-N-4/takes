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

export interface ParityBugDetail {
  fenBefore: string;
  fsfMove: string;
  engineLegalMoves: string[];
}

export interface GameOutcome {
  /** +1 white win, -1 black win, 0 draw. */
  result: 1 | 0 | -1;
  plies: number;
  reason: string;
  parityBugs: string[];
  /** Full diagnostic detail for any real (post per-game-variant-fix) parity disagreement. */
  parityBugDetails: ParityBugDetail[];
  /** True if this game was aborted by a parity bug and must be excluded from scoring (never counted as a draw). */
  excluded: boolean;
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
  const parityBugDetails: ParityBugDetail[] = [];
  let decisiveStreakCount = 0;
  let decisiveSign = 0;
  let drawStreakCount = 0;

  for (;;) {
    const status = game.status();
    if (status.result !== '*') {
      const result = status.result === '1-0' ? 1 : status.result === '0-1' ? -1 : 0;
      return { result, plies: game.ply(), reason: status.reason ?? status.result, parityBugs, parityBugDetails, excluded: false };
    }
    if (game.ply() >= ruleset.maxPlies) {
      return { result: 0, plies: game.ply(), reason: 'move-cap', parityBugs, parityBugDetails, excluded: false };
    }

    const stm: Color = game.sideToMove();
    const fenBefore = game.toFEN();
    const { bestmove, scoreCp } = await fsf.goNodes(fenBefore, nodes);
    if (!bestmove) {
      // FSF sees no legal move; defer to the Takes engine's own status on the next loop iteration
      // by forcing a stalemate/checkmate read — if Takes still thinks moves exist, that's a parity bug.
      if (game.legalMoves().length > 0) {
        parityBugs.push(`fsf returned no bestmove at ply ${game.ply()} but Takes has legal moves`);
        parityBugDetails.push({ fenBefore, fsfMove: '(none)', engineLegalMoves: game.legalMoves().map((m) => game.moveToUci(m)) });
        return { result: 0, plies: game.ply(), reason: 'fsf-no-move-parity-bug', parityBugs, parityBugDetails, excluded: true };
      }
      return { result: game.inCheck() ? (stm === 'w' ? -1 : 1) : 0, plies: game.ply(), reason: 'fsf-no-move', parityBugs, parityBugDetails, excluded: false };
    }
    const move = game.parseUci(bestmove);
    if (!move) {
      parityBugs.push(`ply ${game.ply()} (${stm}): FSF played '${bestmove}', Takes engine rejected it as illegal`);
      parityBugDetails.push({ fenBefore, fsfMove: bestmove, engineLegalMoves: game.legalMoves().map((m) => game.moveToUci(m)) });
      // Abort and EXCLUDE this game from scoring rather than silently counting it as a draw.
      return { result: 0, plies: game.ply(), reason: 'parity-bug-abort', parityBugs, parityBugDetails, excluded: true };
    }
    game.make(move);

    if (scoreCp !== null) {
      const whiteCp = stm === 'w' ? scoreCp : -scoreCp;
      if (Math.abs(whiteCp) > adj.decisiveCp) {
        const sign = Math.sign(whiteCp);
        decisiveStreakCount = sign === decisiveSign ? decisiveStreakCount + 1 : 1;
        decisiveSign = sign;
        if (decisiveStreakCount >= adj.decisiveStreak) {
          return { result: sign > 0 ? 1 : -1, plies: game.ply(), reason: 'adjudicated-decisive', parityBugs, parityBugDetails, excluded: false };
        }
      } else {
        decisiveStreakCount = 0;
      }
      if (game.ply() >= adj.drawMinPly && Math.abs(whiteCp) < adj.drawCp) {
        drawStreakCount++;
        if (drawStreakCount >= adj.drawPlies) {
          return { result: 0, plies: game.ply(), reason: 'adjudicated-draw', parityBugs, parityBugDetails, excluded: false };
        }
      } else {
        drawStreakCount = 0;
      }
    }
  }
}
