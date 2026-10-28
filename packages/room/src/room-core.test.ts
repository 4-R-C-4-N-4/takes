import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import type { ServerMsg } from '@takes/protocol';
import { RoomCore, type RoomScheduler, type RoomCoreOpts, noopScheduler } from './index.js';

const VALID_W = '2026.1:RNBQKBNR/PPPPPPPP/8';
const VALID_B = '2026.1:RNBQKBNR/PPPPPPPP/8';
const INVALID = '2026.1:RNBQ1BNR/PPPPPPPP/8'; // no king -> KING_COUNT error

function makeSends() {
  const log: Array<{ color: 'w' | 'b'; msg: ServerMsg }> = [];
  const send = (color: 'w' | 'b', msg: ServerMsg) => log.push({ color, msg });
  return { log, send };
}

function fakeScheduler() {
  let seq = 0;
  const pending = new Map<number, () => void>();
  const scheduler: RoomScheduler = {
    setTimeout: (fn) => { const id = ++seq; pending.set(id, fn); return id; },
    clearTimeout: (h) => { pending.delete(h as number); },
  };
  return {
    scheduler,
    fire(id: unknown) { const fn = pending.get(id as number); pending.delete(id as number); fn?.(); },
    fireAll() { for (const [, fn] of pending) fn(); pending.clear(); },
    pendingCount: () => pending.size,
  };
}

function makeCore(overrides: Partial<RoomCoreOpts> = {}) {
  const { log, send } = makeSends();
  const core = new RoomCore({
    code: 'TESTROOM',
    rulesetVersion: '2026.1',
    rulesetFor: getRuleset,
    send,
    scheduler: noopScheduler,
    forfeitMs: 1000,
    ...overrides,
  });
  return { core, log };
}

describe('RoomCore: setup', () => {
  it('rejects an invalid setup and does not mark the seat ready', () => {
    const { core, log } = makeCore();
    const issues = core.submitSetup('w', INVALID);
    expect(issues).not.toBeNull();
    expect(issues!.some((i) => i.code === 'KING_COUNT')).toBe(true);
    expect(core.isReady('w')).toBe(false);
    expect(log).toEqual([]);
  });

  it('accepts a valid setup, notifies the opponent, but does not start the game solo', () => {
    const { core, log } = makeCore();
    const issues = core.submitSetup('w', VALID_W);
    expect(issues).toBeNull();
    expect(core.isReady('w')).toBe(true);
    expect(core.phase).toBe('setup');
    expect(log).toEqual([{ color: 'b', msg: { t: 'opponent_ready' } }]);
  });

  it('blind setups: opponent setup is never revealed before both are ready', () => {
    const { core } = makeCore();
    core.submitSetup('w', VALID_W);
    const wState = core.stateFor('w');
    expect(wState.setups).toEqual({ w: VALID_W });
    expect(wState.setups.b).toBeUndefined();
  });

  it('starts the game once both seats are ready, sending game_start to both', () => {
    const { core, log } = makeCore();
    core.submitSetup('w', VALID_W);
    core.submitSetup('b', VALID_B);
    expect(core.phase).toBe('playing');
    expect(core.game).not.toBeNull();
    const starts = log.filter((e) => e.msg.t === 'game_start');
    expect(starts.map((e) => e.color).sort()).toEqual(['b', 'w']);
    for (const e of starts) {
      const m = e.msg as { t: 'game_start'; setups: { w: string; b: string } };
      expect(m.setups).toEqual({ w: VALID_W, b: VALID_B });
    }
  });

  it('after game start, each seat sees both setups', () => {
    const { core } = makeCore();
    core.submitSetup('w', VALID_W);
    core.submitSetup('b', VALID_B);
    const state = core.stateFor('b');
    expect(state.setups).toEqual({ w: VALID_W, b: VALID_B });
  });
});

describe('RoomCore: moves', () => {
  function playing() {
    const { core, log } = makeCore();
    core.submitSetup('w', VALID_W);
    core.submitSetup('b', VALID_B);
    log.length = 0;
    return { core, log };
  }

  it('rejects a move from the wrong color', () => {
    const { core } = playing();
    const err = core.applyMove('b', 'e2e4', 0);
    expect(err).toBe('not_your_turn');
  });

  it('rejects a stale ply', () => {
    const { core } = playing();
    const err = core.applyMove('w', 'e2e4', 5);
    expect(err).toBe('stale_ply');
  });

  it('rejects an illegal move', () => {
    const { core } = playing();
    const err = core.applyMove('w', 'e2e5', 0);
    expect(err).toBe('illegal_move');
  });

  it('applies a legal move and broadcasts move_made to both seats', () => {
    const { core, log } = playing();
    const err = core.applyMove('w', 'e2e4', 0);
    expect(err).toBeNull();
    expect(core.moves).toEqual(['e2e4']);
    const moveMsgs = log.filter((e) => e.msg.t === 'move_made');
    expect(moveMsgs.map((e) => e.color).sort()).toEqual(['b', 'w']);
  });
});

describe('RoomCore: resign / draw', () => {
  function playing() {
    const { core, log } = makeCore();
    core.submitSetup('w', VALID_W);
    core.submitSetup('b', VALID_B);
    log.length = 0;
    return { core, log };
  }

  it('resign ends the game in favor of the opponent', () => {
    const { core, log } = playing();
    core.resign('w');
    expect(core.phase).toBe('over');
    expect(core.result).toEqual({ result: '0-1', reason: 'resign' });
    expect(log.some((e) => e.msg.t === 'game_over')).toBe(true);
  });

  it('draw offer then accept ends the game as a draw', () => {
    const { core, log } = playing();
    core.offerDraw('w');
    expect(core.drawOfferBy).toBe('w');
    expect(log).toEqual([{ color: 'b', msg: { t: 'draw_offered', by: 'w' } }]);
    core.acceptDraw('b');
    expect(core.result).toEqual({ result: '1/2-1/2', reason: 'agreement' });
  });

  it('a seat cannot accept its own draw offer', () => {
    const { core } = playing();
    core.offerDraw('w');
    core.acceptDraw('w');
    expect(core.phase).toBe('playing');
  });

  it('a move clears a pending draw offer', () => {
    const { core } = playing();
    core.offerDraw('w');
    core.applyMove('w', 'e2e4', 0);
    expect(core.drawOfferBy).toBeNull();
  });
});

describe('RoomCore: checkmate ends the game', () => {
  it("fool's mate reaches game_over with checkmate", () => {
    const { core, log } = makeCore();
    core.submitSetup('w', VALID_W);
    core.submitSetup('b', VALID_B);
    log.length = 0;
    // Fool's mate: 1. f3 e5 2. g4 Qh4#
    for (const uci of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) {
      const game = core.game!;
      const err = core.applyMove(game.sideToMove(), uci, game.ply());
      expect(err).toBeNull();
    }
    expect(core.phase).toBe('over');
    expect(core.result).toEqual({ result: '0-1', reason: 'checkmate' });
    expect(log.some((e) => e.msg.t === 'game_over')).toBe(true);
  });
});

describe('RoomCore: forfeit via fake scheduler', () => {
  it('arms a forfeit timer on disconnect and finishes the game when it fires', () => {
    const fake = fakeScheduler();
    const { core, log } = makeCore({ scheduler: fake.scheduler });
    core.submitSetup('w', VALID_W);
    core.submitSetup('b', VALID_B);
    log.length = 0;
    core.onDisconnect('w');
    expect(log.some((e) => e.color === 'b' && e.msg.t === 'opponent_connection' && !(e.msg as { connected: boolean }).connected)).toBe(true);
    expect(fake.pendingCount()).toBe(1);
    fake.fireAll();
    expect(core.phase).toBe('over');
    expect(core.result).toEqual({ result: '0-1', reason: 'abandon' });
  });

  it('reconnecting before the timer fires cancels the forfeit', () => {
    const fake = fakeScheduler();
    const { core } = makeCore({ scheduler: fake.scheduler });
    core.submitSetup('w', VALID_W);
    core.submitSetup('b', VALID_B);
    core.onDisconnect('w');
    core.onConnect('w');
    expect(fake.pendingCount()).toBe(0);
    fake.fireAll();
    expect(core.phase).toBe('playing');
  });

  it('a disabled scheduler (noopScheduler) never forfeits', () => {
    const { core } = makeCore({ scheduler: noopScheduler });
    core.submitSetup('w', VALID_W);
    core.submitSetup('b', VALID_B);
    core.onDisconnect('w');
    expect(core.phase).toBe('playing');
  });
});

describe('RoomCore: reconstruction from (setups, moves)', () => {
  it('rebuilds an in-progress game by replaying moves, never from a mid-game FEN', () => {
    const { log, send } = makeSends();
    const core = new RoomCore({
      code: 'RESUME1',
      rulesetVersion: '2026.1',
      rulesetFor: getRuleset,
      send,
      scheduler: noopScheduler,
      forfeitMs: 1000,
      seats: { w: { setup: VALID_W, ready: true }, b: { setup: VALID_B, ready: true } },
      moves: ['e2e4', 'e7e5'],
    });
    expect(core.phase).toBe('playing');
    expect(core.moves).toEqual(['e2e4', 'e7e5']);
    expect(core.game).not.toBeNull();
    expect(core.game!.sideToMove()).toBe('w');
    expect(log).toEqual([]); // reconstruction is silent, no messages sent
  });

  it('stays in setup phase if only one side has submitted', () => {
    const { send } = makeSends();
    const core = new RoomCore({
      code: 'RESUME2',
      rulesetVersion: '2026.1',
      rulesetFor: getRuleset,
      send,
      scheduler: noopScheduler,
      forfeitMs: 1000,
      seats: { w: { setup: VALID_W, ready: true }, b: { ready: false } },
    });
    expect(core.phase).toBe('setup');
    expect(core.game).toBeNull();
  });

  it('detects a finished game on reconstruction (checkmate replay)', () => {
    const { send } = makeSends();
    const core = new RoomCore({
      code: 'RESUME3',
      rulesetVersion: '2026.1',
      rulesetFor: getRuleset,
      send,
      scheduler: noopScheduler,
      forfeitMs: 1000,
      seats: { w: { setup: VALID_W, ready: true }, b: { setup: VALID_B, ready: true } },
      moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
    });
    expect(core.phase).toBe('over');
    expect(core.result).toEqual({ result: '0-1', reason: 'checkmate' });
  });
});

describe('RoomCore: no forbidden imports', () => {
  it('package source never imports node:*, ws, better-sqlite3, or the bot', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(import.meta.dirname, '.');
    const forbidden = /from ['"](node:|ws$|ws\/|better-sqlite3|.*fsf-bot)/;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      const text = readFileSync(join(dir, file), 'utf8');
      expect(forbidden.test(text)).toBe(false);
    }
  });
});
