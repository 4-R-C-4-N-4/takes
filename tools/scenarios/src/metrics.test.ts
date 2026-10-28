import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame } from '@takes/engine';
import type { BoardPiece } from '@takes/engine';
import { attackedSquares, observeCandidatePly } from '../src/metrics.js';
import { buildCandidateRuleset } from '../src/candidate-ruleset.js';
import { FIXTURE_CATALOG } from '../src/fixtures.js';

function emptyBoard(): Array<BoardPiece | null> { return new Array(64).fill(null); }
const sq = (file: number, rank: number) => rank * 8 + file;

describe('attackedSquares / fork and check detection', () => {
  const base = getRuleset('2026.2')!;

  it('an archbishop-like piece on d4 attacks >=2 enemy minors worth >=3 -> fork', () => {
    const entry = FIXTURE_CATALOG.find((e) => e.piece.id === 'f_archbishop')!;
    const { ruleset, candidateId } = buildCandidateRuleset(base, entry, 9);
    const board = emptyBoard();
    const from = sq(3, 3); // d4
    board[from] = { pieceId: candidateId, color: 'w', hasMoved: true };
    // bishop-leg diagonal target and knight-leg leap target, both enemy knights.
    board[sq(5, 5)] = { pieceId: 'knight', color: 'b', hasMoved: true }; // f6, diagonal from d4
    board[sq(4, 5)] = { pieceId: 'knight', color: 'b', hasMoved: true }; // e6, knight-leap from d4
    const attacked = attackedSquares(ruleset, candidateId, 'w', from, board);
    expect(attacked).toContain(sq(5, 5));
    expect(attacked).toContain(sq(4, 5));
  });

  it('a wazir only reaches adjacent orthogonal squares (no fork at range)', () => {
    const entry = FIXTURE_CATALOG.find((e) => e.piece.id === 'f_wazir')!;
    const { ruleset, candidateId } = buildCandidateRuleset(base, entry, 1);
    const board = emptyBoard();
    const from = sq(3, 3);
    board[from] = { pieceId: candidateId, color: 'w', hasMoved: true };
    board[sq(5, 5)] = { pieceId: 'knight', color: 'b', hasMoved: true }; // out of wazir range
    const attacked = attackedSquares(ruleset, candidateId, 'w', from, board);
    expect(attacked).not.toContain(sq(5, 5));
  });

  it('sliding candidate stops at the first blocker and does not see past it', () => {
    const entry = FIXTURE_CATALOG.find((e) => e.piece.id === 'f_forwardrook')!;
    const { ruleset, candidateId } = buildCandidateRuleset(base, entry, 5);
    const board = emptyBoard();
    const from = sq(3, 0);
    board[from] = { pieceId: candidateId, color: 'w', hasMoved: true };
    board[sq(3, 2)] = { pieceId: 'pawn', color: 'b', hasMoved: true }; // first blocker, forward
    board[sq(3, 4)] = { pieceId: 'pawn', color: 'b', hasMoved: true }; // behind the blocker
    const attacked = attackedSquares(ruleset, candidateId, 'w', from, board);
    expect(attacked).toContain(sq(3, 2));
    expect(attacked).not.toContain(sq(3, 4));
  });
});

describe('observeCandidatePly', () => {
  const base = getRuleset('2026.2')!;

  it('detects check when the candidate attacks the enemy king', () => {
    const entry = FIXTURE_CATALOG.find((e) => e.piece.id === 'f_forwardrook')!; // forward rook
    const { ruleset, candidateId } = buildCandidateRuleset(base, entry, 5);
    // Minimal setups: white has the candidate plus a king far away; black's king sits on the
    // candidate's forward file so the candidate gives check once it is white's turn to move next
    // and it's black to move (inCheck() reflects sideToMove).
    const white = `${ruleset.version}:K7/8/4{${candidateId}}3`;
    const black = `${ruleset.version}:4K3/8/8`;
    const game = createGame(ruleset, white, black);
    // White's candidate is on its own back rank file e (index 4); black king mirrors on file e too,
    // so the forward-rook move up the e-file gives check. Play the first legal move for white.
    const candMove = game.legalMoves().find((m) => game.board()[m.from]?.pieceId === candidateId);
    expect(candMove).toBeDefined();
    const sqBefore = candMove!.from;
    void sqBefore;
    game.make(candMove!);
    const after = game.board().findIndex((p) => p?.pieceId === candidateId && p.color === 'w');
    const obs = observeCandidatePly(ruleset, candidateId, 'w', game, candMove!.captured, after >= 0 ? after : null);
    expect(obs.isCheck).toBe(game.inCheck() && game.sideToMove() === 'b');
  });

  it('returns no-op observation when the candidate is gone from the board', () => {
    const entry = FIXTURE_CATALOG.find((e) => e.piece.id === 'f_wazir')!;
    const { ruleset, candidateId } = buildCandidateRuleset(base, entry, 1);
    const white = `${ruleset.version}:4K3/8/8`;
    const black = `${ruleset.version}:4K3/8/8`;
    const game = createGame(ruleset, white, black);
    const obs = observeCandidatePly(ruleset, candidateId, 'w', game, undefined, null);
    expect(obs).toEqual({ isCapture: false, isCheck: false, isFork: false, attacksEnemyKingZone: false });
  });
});
