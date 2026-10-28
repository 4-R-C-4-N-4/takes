/**
 * Pure, environment-free room state machine [impl.md "Server"; browser host parity].
 *
 * RoomCore owns phase, seat setup/ready, the engine Game, moves, draw offers, result and the
 * forfeit timer for exactly one room. It never touches ws, sqlite, node builtins, or the bot
 * process; all of that is injected so the same logic runs server-side (apps/server) and
 * client-side (the host's browser, for peer-to-peer online play) [DECISIONS D9, D12].
 */
import type { Color, Ruleset } from '@takes/library';
import { createGame, type Game } from '@takes/engine';
import { validateProfile, hasErrors, type Issue } from '@takes/validator';
import type { ServerMsg, GameStateWire, WireResult, WireReason } from '@takes/protocol';

function otherColor(c: Color): Color { return c === 'w' ? 'b' : 'w'; }

/** setTimeout/clearTimeout-shaped scheduler, injected so a browser host can disable forfeit. */
export interface RoomScheduler {
  setTimeout(fn: () => void, ms: number): RoomTimerHandle;
  clearTimeout(handle: RoomTimerHandle): void;
}
export type RoomTimerHandle = unknown;

/** Real-time scheduler backed by the platform's timers (works in Node and browsers alike). */
export const realTimeScheduler: RoomScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** A scheduler that never fires — for hosts (e.g. local play) that disable forfeit entirely. */
export const noopScheduler: RoomScheduler = {
  setTimeout: () => null,
  clearTimeout: () => {},
};

/** Optional persistence hooks; the server implements these with sqlite. Fire only on success. */
export interface RoomPersistence {
  onSetup?(color: Color, setup: string): void;
  onGameStart?(): void;
  onMove?(ply: number, uci: string): void;
  onGameOver?(result: WireResult, reason: WireReason): void;
}

export interface InitialSeatState {
  setup?: string;
  ready: boolean;
  /** Seats that never disconnect (e.g. a bot) should start "connected" so forfeit never arms. */
  connected?: boolean;
}

export interface RoomCoreOpts {
  code: string;
  rulesetVersion: string;
  /** Resolves a ruleset by version string (injected instead of importing @takes/library's registry directly). */
  rulesetFor: (version: string) => Ruleset | undefined;
  /** Delivers a ServerMsg to one seat. The host decides how/whether to actually transmit it. */
  send: (color: Color, msg: ServerMsg) => void;
  scheduler: RoomScheduler;
  forfeitMs: number;
  persistence?: RoomPersistence;
  /** Initial seat setup/ready, e.g. a pre-seated bot seat or seats reloaded from storage. */
  seats?: { w: InitialSeatState; b: InitialSeatState };
  /**
   * Prior moves to replay on construction — used to reconstruct a resumed room. Never passed
   * alongside a mid-game FEN: the game is always rebuilt deterministically from both setups.
   */
  moves?: string[];
}

interface CoreSeat {
  setup?: string;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  forfeitTimer: RoomTimerHandle | null;
}

export type RoomPhase = 'setup' | 'playing' | 'over';

export class RoomCore {
  readonly code: string;
  readonly rulesetVersion: string;
  phase: RoomPhase = 'setup';
  game: Game | null = null;
  moves: string[] = [];
  drawOfferBy: Color | null = null;
  result: { result: WireResult; reason: WireReason } | null = null;

  private readonly rulesetFor: (version: string) => Ruleset | undefined;
  private readonly sendFn: (color: Color, msg: ServerMsg) => void;
  private readonly scheduler: RoomScheduler;
  private readonly forfeitMs: number;
  private readonly persistence: RoomPersistence;
  private readonly seatState: { w: CoreSeat; b: CoreSeat };
  private closed = false;

  constructor(opts: RoomCoreOpts) {
    this.code = opts.code;
    this.rulesetVersion = opts.rulesetVersion;
    this.rulesetFor = opts.rulesetFor;
    this.sendFn = opts.send;
    this.scheduler = opts.scheduler;
    this.forfeitMs = opts.forfeitMs;
    this.persistence = opts.persistence ?? {};
    const mk = (s?: InitialSeatState): CoreSeat => ({
      setup: s?.setup, ready: s?.ready ?? false, connected: s?.connected ?? false, disconnectedAt: null, forfeitTimer: null,
    });
    this.seatState = { w: mk(opts.seats?.w), b: mk(opts.seats?.b) };

    if (this.bothReady() && opts.moves) {
      this.phase = 'playing';
      try {
        const game = createGame(this.ruleset(), this.seatState.w.setup!, this.seatState.b.setup!);
        for (const uci of opts.moves) {
          const parsed = game.parseUci(uci);
          if (!parsed) { this.phase = 'over'; break; }
          game.make(parsed);
          this.moves.push(uci);
        }
        this.game = game;
        const status = game.status();
        if (status.result !== '*') {
          this.phase = 'over';
          this.result = { result: status.result, reason: status.reason ?? 'move-cap' };
        }
      } catch {
        this.phase = 'over';
      }
    }
  }

  ruleset(): Ruleset { return this.rulesetFor(this.rulesetVersion)!; }

  private send(color: Color, msg: ServerMsg): void { this.sendFn(color, msg); }

  isReady(color: Color): boolean { return this.seatState[color].ready; }
  setupOf(color: Color): string | undefined { return this.seatState[color].setup; }
  bothReady(): boolean { return this.seatState.w.ready && this.seatState.b.ready; }

  stateFor(color: Color): GameStateWire {
    const opp = otherColor(color);
    const mine = this.seatState[color];
    const other = this.seatState[opp];
    const setups: { w?: string; b?: string } = {};
    if (mine.setup) setups[color] = mine.setup;
    if (this.phase !== 'setup' && other.setup) setups[opp] = other.setup;
    const out: GameStateWire = {
      code: this.code,
      ruleset: this.rulesetVersion,
      you: color,
      phase: this.phase,
      setups,
      ready: { w: this.seatState.w.ready, b: this.seatState.b.ready },
      moves: [...this.moves],
    };
    if (this.game) out.fen = this.game.toFEN();
    if (this.drawOfferBy) out.drawOfferBy = this.drawOfferBy;
    if (this.result) out.result = this.result;
    return out;
  }

  /** Blind setup: never leaks a setup to the opponent before both seats are ready. */
  submitSetup(color: Color, setup: string): Issue[] | null {
    const issues = validateProfile(setup, this.ruleset(), { color });
    if (hasErrors(issues)) return issues;
    const seat = this.seatState[color];
    seat.setup = setup;
    seat.ready = true;
    this.persistence.onSetup?.(color, setup);
    this.send(otherColor(color), { t: 'opponent_ready' });
    if (this.bothReady()) this.startGame();
    return null;
  }

  private startGame(): void {
    this.phase = 'playing';
    this.game = createGame(this.ruleset(), this.seatState.w.setup!, this.seatState.b.setup!);
    this.persistence.onGameStart?.();
    const msg: ServerMsg = { t: 'game_start', setups: { w: this.seatState.w.setup!, b: this.seatState.b.setup! }, fen: this.game.toFEN() };
    this.send('w', msg);
    this.send('b', msg);
  }

  /** Applies a legal move. Returns null on success or an error reason on rejection. */
  applyMove(color: Color, uci: string, ply: number): string | null {
    if (this.phase !== 'playing' || !this.game) return 'wrong_phase';
    if (this.game.sideToMove() !== color) return 'not_your_turn';
    if (this.game.ply() !== ply) return 'stale_ply';
    const move = this.game.parseUci(uci);
    if (!move) return 'illegal_move';
    this.game.make(move);
    this.moves.push(uci);
    this.drawOfferBy = null;
    this.persistence.onMove?.(this.game.ply() - 1, uci);
    const made: ServerMsg = { t: 'move_made', uci, ply: this.game.ply(), hash: this.game.hash() };
    this.send('w', made);
    this.send('b', made);
    this.checkGameEnd();
    return null;
  }

  private checkGameEnd(): void {
    if (!this.game || this.phase !== 'playing') return;
    const status = this.game.status();
    if (status.result !== '*') this.finishGame(status.result, status.reason ?? 'move-cap');
  }

  finishGame(result: WireResult, reason: WireReason): void {
    this.phase = 'over';
    this.result = { result, reason };
    this.persistence.onGameOver?.(result, reason);
    const msg: ServerMsg = { t: 'game_over', result, reason };
    this.send('w', msg);
    this.send('b', msg);
    for (const c of ['w', 'b'] as Color[]) {
      const seat = this.seatState[c];
      if (seat.forfeitTimer) { this.scheduler.clearTimeout(seat.forfeitTimer); seat.forfeitTimer = null; }
    }
  }

  resign(color: Color): void {
    if (this.phase !== 'playing') return;
    this.finishGame(color === 'w' ? '0-1' : '1-0', 'resign');
  }

  offerDraw(color: Color): void {
    if (this.phase !== 'playing') return;
    this.drawOfferBy = color;
    this.send(otherColor(color), { t: 'draw_offered', by: color });
  }

  acceptDraw(color: Color): void {
    if (this.phase !== 'playing' || !this.drawOfferBy || this.drawOfferBy === color) return;
    this.finishGame('1/2-1/2', 'agreement');
  }

  onConnect(color: Color): void {
    const seat = this.seatState[color];
    seat.connected = true;
    seat.disconnectedAt = null;
    if (seat.forfeitTimer) { this.scheduler.clearTimeout(seat.forfeitTimer); seat.forfeitTimer = null; }
    this.send(otherColor(color), { t: 'opponent_connection', connected: true });
  }

  onDisconnect(color: Color): void {
    if (this.closed) return;
    const seat = this.seatState[color];
    seat.connected = false;
    seat.disconnectedAt = Date.now();
    this.send(otherColor(color), { t: 'opponent_connection', connected: false, forfeitInMs: this.forfeitMs });
    this.armForfeitTimer(color);
  }

  /** Marks a seat disconnected without notifying the opponent — for rebuilding from storage. */
  seedDisconnected(color: Color): void {
    const seat = this.seatState[color];
    seat.connected = false;
    seat.disconnectedAt = Date.now();
  }

  armForfeitTimer(color: Color): void {
    if (this.closed) return;
    const seat = this.seatState[color];
    if (seat.connected) return;
    if (this.phase === 'over') return;
    if (seat.forfeitTimer) this.scheduler.clearTimeout(seat.forfeitTimer);
    const remaining = seat.disconnectedAt ? Math.max(0, this.forfeitMs - (Date.now() - seat.disconnectedAt)) : this.forfeitMs;
    seat.forfeitTimer = this.scheduler.setTimeout(() => {
      if (this.phase === 'over') return;
      this.finishGame(color === 'w' ? '0-1' : '1-0', 'abandon');
    }, remaining);
  }

  /** Disables further sends/timers (host is shutting down this room). */
  close(): void {
    this.closed = true;
    for (const c of ['w', 'b'] as Color[]) {
      const seat = this.seatState[c];
      if (seat.forfeitTimer) { this.scheduler.clearTimeout(seat.forfeitTimer); seat.forfeitTimer = null; }
    }
  }
}
