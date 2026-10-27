/** Room lifecycle, persistence and bot wiring [impl.md "Server"; DECISIONS D9, D12]. */
import type { WebSocket } from 'ws';
import type { Color } from '@takes/library';
import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
import { createGame, type Game } from '@takes/engine';
import { validateProfile, hasErrors, type Issue } from '@takes/validator';
import type { ServerMsg, GameStateWire, WireResult, WireReason } from '@takes/protocol';
import { openDb, hashToken, type DB } from './db.js';
import { generateInviteCode, generateToken } from './ids.js';
import { DIFFICULTY_OPTS, FsfBot, writeGameVariantIni, type Difficulty } from './bot/fsf-bot.js';
import botProfilesJson from '../bots/profiles.json' with { type: 'json' };

const botProfiles = botProfilesJson as Record<Difficulty, string>;

export interface SeatInfo {
  color: Color;
  token: string;
  tokenHash: string;
  ws: WebSocket | null;
  setup?: string;
  ready: boolean;
  isBot: boolean;
  disconnectedAt: number | null;
  forfeitTimer: NodeJS.Timeout | null;
}

function otherColor(c: Color): Color { return c === 'w' ? 'b' : 'w'; }

/** Parses a ruleset request string that may carry a bot suffix: "<version>#bot:<level>". */
export function parseRulesetRequest(raw: string): { version: string; bot: Difficulty | null } {
  const idx = raw.indexOf('#bot:');
  if (idx === -1) return { version: raw, bot: null };
  const version = raw.slice(0, idx);
  const level = raw.slice(idx + 5);
  const bot: Difficulty | null = level === 'easy' || level === 'medium' || level === 'hard' ? level : null;
  return { version, bot };
}

export class Room {
  code: string;
  rulesetVersion: string;
  botDifficulty: Difficulty | null;
  seats: { w: SeatInfo; b: SeatInfo };
  phase: 'setup' | 'playing' | 'over' = 'setup';
  game: Game | null = null;
  moves: string[] = [];
  drawOfferBy: Color | null = null;
  result: { result: WireResult; reason: WireReason } | null = null;

  constructor(code: string, rulesetVersion: string, botDifficulty: Difficulty | null, seats: { w: SeatInfo; b: SeatInfo }) {
    this.code = code;
    this.rulesetVersion = rulesetVersion;
    this.botDifficulty = botDifficulty;
    this.seats = seats;
  }

  ruleset() { return getRuleset(this.rulesetVersion)!; }

  seatByColor(c: Color): SeatInfo { return this.seats[c]; }
  seatByToken(token: string): SeatInfo | null {
    const hash = hashToken(token);
    if (this.seats.w.tokenHash === hash) return this.seats.w;
    if (this.seats.b.tokenHash === hash) return this.seats.b;
    return null;
  }

  opponentOf(c: Color): SeatInfo { return this.seats[otherColor(c)]; }

  bothReady(): boolean { return this.seats.w.ready && this.seats.b.ready; }

  stateFor(color: Color): GameStateWire {
    const mine = this.seats[color];
    const opp = this.opponentOf(color);
    const setups: { w?: string; b?: string } = {};
    if (mine.setup) setups[color] = mine.setup;
    if (this.phase !== 'setup' && opp.setup) setups[otherColor(color)] = opp.setup;
    const out: GameStateWire = {
      code: this.code,
      ruleset: this.rulesetVersion,
      you: color,
      phase: this.phase,
      setups,
      ready: { w: this.seats.w.ready, b: this.seats.b.ready },
      moves: [...this.moves],
    };
    if (this.game) out.fen = this.game.toFEN();
    if (this.drawOfferBy) out.drawOfferBy = this.drawOfferBy;
    if (this.result) out.result = this.result;
    return out;
  }
}

function send(ws: WebSocket | null, msg: ServerMsg): void {
  if (!ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

export interface RoomManagerOpts {
  dbPath: string;
  forfeitMs: number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private db: DB;
  private forfeitMs: number;
  bot: FsfBot = new FsfBot();
  rejectedBotMoves: Array<{ room: string; fen: string; uci: string }> = [];
  private closed = false;

  constructor(opts: RoomManagerOpts) {
    this.db = openDb(opts.dbPath);
    this.forfeitMs = opts.forfeitMs;
    this.reloadFromDb();
  }

  getDb(): DB { return this.db; }

  /** Rebuild in-memory rooms from SQLite by replaying moves [impl.md "Persistence"]. */
  private reloadFromDb(): void {
    for (const r of this.db.allRooms()) {
      if (r.status === 'over') continue; // finished games are not resumable, kept for history only
      const seatsRows = this.db.seatsFor(r.code);
      const wRow = seatsRows.find((s) => s.color === 'w');
      const bRow = seatsRows.find((s) => s.color === 'b');
      if (!wRow || !bRow) continue;
      const mkSeat = (color: Color, row: { token_hash: string; setup: string | null }): SeatInfo => ({
        color, token: '', tokenHash: row.token_hash, ws: null, setup: row.setup ?? undefined,
        ready: !!row.setup, isBot: false, disconnectedAt: Date.now(), forfeitTimer: null,
      });
      const seats = { w: mkSeat('w', wRow), b: mkSeat('b', bRow) };
      const { version, bot } = parseRulesetRequest(r.ruleset);
      const room = new Room(r.code, version, bot, seats);
      const movesRows = this.db.movesFor(r.code);
      if (seats.w.ready && seats.b.ready) {
        room.phase = 'playing';
        try {
          const game = createGame(room.ruleset(), seats.w.setup!, seats.b.setup!);
          for (const mv of movesRows) {
            const parsed = game.parseUci(mv.uci);
            if (!parsed) { room.phase = 'over'; break; }
            game.make(parsed);
            room.moves.push(mv.uci);
          }
          room.game = game;
          const status = game.status();
          if (status.result !== '*') {
            room.phase = 'over';
            room.result = { result: status.result, reason: status.reason ?? 'move-cap' };
          }
        } catch {
          room.phase = 'over';
        }
      }
      this.rooms.set(r.code, room);
      this.armForfeitTimer(room, 'w');
      this.armForfeitTimer(room, 'b');
    }
  }

  get(code: string): Room | undefined { return this.rooms.get(code); }

  createRoom(rulesetRaw: string, hostColor: Color | undefined): { room: Room; seat: SeatInfo } | { error: string } {
    const { version, bot } = parseRulesetRequest(rulesetRaw);
    const ruleset = getRuleset(version);
    if (!ruleset) return { error: `unknown ruleset version '${version}'` };
    if (bot && !FsfBot.available()) return { error: 'bot engine unavailable: Fairy-Stockfish binary not found' };

    let code = generateInviteCode();
    while (this.rooms.has(code)) code = generateInviteCode();

    const color: Color = hostColor ?? (Math.random() < 0.5 ? 'w' : 'b');
    const token = generateToken();
    const hostSeat: SeatInfo = {
      color, token, tokenHash: hashToken(token), ws: null, ready: false, isBot: false,
      disconnectedAt: null, forfeitTimer: null,
    };
    const otherC = otherColor(color);
    let otherSeat: SeatInfo;
    if (bot) {
      const botToken = generateToken();
      otherSeat = {
        color: otherC, token: botToken, tokenHash: hashToken(botToken), ws: null, ready: true, isBot: true,
        setup: botProfiles[bot], disconnectedAt: null, forfeitTimer: null,
      };
    } else {
      otherSeat = {
        color: otherC, token: '', tokenHash: '', ws: null, ready: false, isBot: false,
        disconnectedAt: null, forfeitTimer: null,
      };
    }
    const seats = color === 'w' ? { w: hostSeat, b: otherSeat } : { w: otherSeat, b: hostSeat };
    const room = new Room(code, version, bot, seats);
    this.rooms.set(code, room);

    this.db.insertRoom(code, rulesetRaw, 'setup', bot);
    this.db.insertSeat(code, hostSeat.color, hostSeat.tokenHash);
    if (!bot) this.db.insertSeat(code, otherSeat.color, otherSeat.tokenHash);
    else { this.db.insertSeat(code, otherSeat.color, otherSeat.tokenHash); this.db.setSeatSetup(code, otherSeat.color, otherSeat.setup!); }

    return { room, seat: hostSeat };
  }

  joinRoom(code: string): { room: Room; seat: SeatInfo } | { error: string } {
    const room = this.rooms.get(code);
    if (!room) return { error: 'no such room' };
    const openSeat = !room.seats.w.token && !room.seats.w.isBot ? room.seats.w
      : (!room.seats.b.token && !room.seats.b.isBot ? room.seats.b : null);
    if (!openSeat) return { error: 'room is full' };
    const token = generateToken();
    openSeat.token = token;
    openSeat.tokenHash = hashToken(token);
    this.db.updateSeatToken(code, openSeat.color, openSeat.tokenHash);
    const opp = room.opponentOf(openSeat.color);
    send(opp.ws, { t: 'opponent_joined' });
    return { room, seat: openSeat };
  }

  resume(token: string): { room: Room; seat: SeatInfo } | { error: string } {
    for (const room of this.rooms.values()) {
      const seat = room.seatByToken(token);
      if (seat) return { room, seat };
    }
    return { error: 'bad token' };
  }

  submitSetup(room: Room, seat: SeatInfo, setup: string): Issue[] | null {
    const issues = validateProfile(setup, room.ruleset(), { color: seat.color });
    if (hasErrors(issues)) return issues;
    seat.setup = setup;
    seat.ready = true;
    this.db.setSeatSetup(room.code, seat.color, setup);
    const opp = room.opponentOf(seat.color);
    send(opp.ws, { t: 'opponent_ready' });
    if (room.bothReady()) this.startGame(room);
    return null;
  }

  private startGame(room: Room): void {
    room.phase = 'playing';
    room.game = createGame(room.ruleset(), room.seats.w.setup!, room.seats.b.setup!);
    this.db.updateRoomStatus(room.code, 'playing');
    const msg: ServerMsg = { t: 'game_start', setups: { w: room.seats.w.setup!, b: room.seats.b.setup! }, fen: room.game.toFEN() };
    send(room.seats.w.ws, msg);
    send(room.seats.b.ws, msg);
    this.maybeTriggerBot(room);
  }

  /** Applies a legal move, persists, broadcasts, checks for game end. Returns null on success or an error reason. */
  applyMove(room: Room, color: Color, uci: string, ply: number): string | null {
    if (room.phase !== 'playing' || !room.game) return 'wrong_phase';
    if (room.game.sideToMove() !== color) return 'not_your_turn';
    if (room.game.ply() !== ply) return 'stale_ply';
    const move = room.game.parseUci(uci);
    if (!move) return 'illegal_move';
    room.game.make(move);
    room.moves.push(uci);
    room.drawOfferBy = null;
    this.db.insertMove(room.code, room.game.ply() - 1, uci);
    const made: ServerMsg = { t: 'move_made', uci, ply: room.game.ply(), hash: room.game.hash() };
    send(room.seats.w.ws, made);
    send(room.seats.b.ws, made);
    this.checkGameEnd(room);
    if (room.phase === 'playing') this.maybeTriggerBot(room);
    return null;
  }

  private checkGameEnd(room: Room): void {
    if (!room.game || room.phase !== 'playing') return;
    const status = room.game.status();
    if (status.result !== '*') {
      this.finishGame(room, status.result, status.reason ?? 'move-cap');
    }
  }

  finishGame(room: Room, result: WireResult, reason: WireReason): void {
    room.phase = 'over';
    room.result = { result, reason };
    this.db.setResult(room.code, result, reason);
    this.db.updateRoomStatus(room.code, 'over');
    const msg: ServerMsg = { t: 'game_over', result, reason };
    send(room.seats.w.ws, msg);
    send(room.seats.b.ws, msg);
    for (const c of ['w', 'b'] as Color[]) {
      const seat = room.seats[c];
      if (seat.forfeitTimer) { clearTimeout(seat.forfeitTimer); seat.forfeitTimer = null; }
    }
  }

  resign(room: Room, color: Color): void {
    if (room.phase !== 'playing') return;
    this.finishGame(room, color === 'w' ? '0-1' : '1-0', 'resign');
  }

  offerDraw(room: Room, color: Color): void {
    if (room.phase !== 'playing') return;
    room.drawOfferBy = color;
    send(room.opponentOf(color).ws, { t: 'draw_offered', by: color });
  }

  acceptDraw(room: Room, color: Color): void {
    if (room.phase !== 'playing' || !room.drawOfferBy || room.drawOfferBy === color) return;
    this.finishGame(room, '1/2-1/2', 'agreement');
  }

  onConnect(room: Room, seat: SeatInfo, ws: WebSocket): void {
    seat.ws = ws;
    seat.disconnectedAt = null;
    if (seat.forfeitTimer) { clearTimeout(seat.forfeitTimer); seat.forfeitTimer = null; }
    const opp = room.opponentOf(seat.color);
    send(opp.ws, { t: 'opponent_connection', connected: true });
  }

  onDisconnect(room: Room, seat: SeatInfo): void {
    if (this.closed) return;
    seat.ws = null;
    if (seat.isBot) return;
    seat.disconnectedAt = Date.now();
    const opp = room.opponentOf(seat.color);
    send(opp.ws, { t: 'opponent_connection', connected: false, forfeitInMs: this.forfeitMs });
    this.armForfeitTimer(room, seat.color);
  }

  private armForfeitTimer(room: Room, color: Color): void {
    if (this.closed) return;
    const seat = room.seats[color];
    if (seat.isBot || seat.ws) return;
    if (room.phase === 'over') return;
    if (seat.forfeitTimer) clearTimeout(seat.forfeitTimer);
    const remaining = seat.disconnectedAt ? Math.max(0, this.forfeitMs - (Date.now() - seat.disconnectedAt)) : this.forfeitMs;
    seat.forfeitTimer = setTimeout(() => {
      if (room.phase === 'over') return;
      if (room.phase === 'setup') {
        this.finishGame(room, color === 'w' ? '0-1' : '1-0', 'abandon');
      } else {
        this.finishGame(room, color === 'w' ? '0-1' : '1-0', 'abandon');
      }
    }, remaining);
  }

  // ---- Bot wiring [DECISIONS D12] ----

  private maybeTriggerBot(room: Room): void {
    if (!room.botDifficulty || room.phase !== 'playing' || !room.game) return;
    const toMove = room.game.sideToMove();
    const seat = room.seats[toMove];
    if (!seat.isBot) return;
    void this.runBotMove(room);
  }

  private async runBotMove(room: Room): Promise<void> {
    if (this.closed) return;
    const game = room.game;
    if (!game) return;
    const ruleset = room.ruleset();
    const color = game.sideToMove();
    const promotion = { w: game.promotionTargets('w'), b: game.promotionTargets('b') };
    const startFen = startFenForRoom(room);
    const { path, name } = writeGameVariantIni(ruleset, room.code, promotion, startFen);
    const opts = DIFFICULTY_OPTS[room.botDifficulty!];
    let uci: string;
    try {
      uci = await this.bot.bestMove(startFen, room.moves, { movetimeMs: opts.movetimeMs, skillLevel: opts.skillLevel, variantIniPath: path, variantName: name });
    } catch (e) {
      uci = fallbackMove(game);
      this.rejectedBotMoves.push({ room: room.code, fen: game.toFEN(), uci: `<fsf-error:${e instanceof Error ? e.message : String(e)}>` });
    }
    const parsed = game.parseUci(uci);
    if (!parsed) {
      this.rejectedBotMoves.push({ room: room.code, fen: game.toFEN(), uci });
      uci = fallbackMove(game);
    }
    const expectedPly = game.ply();
    if (this.closed) return;
    const err = this.applyMove(room, color, uci, expectedPly);
    if (err) {
      // Fallback failed too (should not happen); resign the bot's side rather than corrupt state.
      this.finishGame(room, color === 'w' ? '0-1' : '1-0', 'abandon');
    }
  }

  disposeBot(): void { this.bot.dispose(); }
  close(): void {
    this.closed = true;
    for (const room of this.rooms.values()) {
      for (const c of ['w', 'b'] as Color[]) {
        const seat = room.seats[c];
        if (seat.forfeitTimer) { clearTimeout(seat.forfeitTimer); seat.forfeitTimer = null; }
      }
    }
    this.disposeBot();
    this.db.close();
  }
}

function fallbackMove(game: Game): string {
  const legal = game.legalMoves().map((m) => game.moveToUci(m)).sort();
  return legal[0] ?? '0000';
}

/** The FEN the game started from (ply 0), reconstructed by unmaking the in-memory move list is
 * unnecessary: engine FENs are deterministic from setups, so we recompute via a parallel game. */
function startFenForRoom(room: Room): string {
  const fresh = createGame(room.ruleset(), room.seats.w.setup!, room.seats.b.setup!);
  return fresh.toFEN();
}
