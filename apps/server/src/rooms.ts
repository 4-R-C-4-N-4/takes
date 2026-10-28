/** Room lifecycle, persistence and bot wiring [impl.md "Server"; DECISIONS D9, D12].
 * Per-room game logic lives in @takes/room's pure RoomCore; this file is the thin node/ws/sqlite
 * adapter: creation, joining, invite codes, tokens, resume-by-token and bot seats.
 */
import type { WebSocket } from 'ws';
import type { Color } from '@takes/library';
import { getRuleset } from '@takes/library';
import type { Game } from '@takes/engine';
import { createGame } from '@takes/engine';
import type { Issue } from '@takes/validator';
import type { ServerMsg, GameStateWire, WireResult, WireReason } from '@takes/protocol';
import { RoomCore, realTimeScheduler, type RoomPersistence } from '@takes/room';
import { openDb, hashToken, type DB } from './db.js';
import { generateInviteCode, generateToken } from './ids.js';
import { DIFFICULTY_OPTS, FsfBot, writeGameVariantIni, type Difficulty } from './bot/fsf-bot.js';
import botProfilesJson from '../bots/profiles.json' with { type: 'json' };

/** Bot armies are pinned per ruleset, because setup strings carry and validate against a version. */
const botProfiles = botProfilesJson as Record<string, Record<Difficulty, string>>;

export interface SeatInfo {
  color: Color;
  token: string;
  tokenHash: string;
  ws: WebSocket | null;
  isBot: boolean;
}

function otherColor(c: Color): Color { return c === 'w' ? 'b' : 'w'; }

function send(ws: WebSocket | null, msg: ServerMsg): void {
  if (!ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

export class Room {
  code: string;
  rulesetVersion: string;
  botDifficulty: Difficulty | null;
  seats: { w: SeatInfo; b: SeatInfo };
  core: RoomCore;

  constructor(code: string, rulesetVersion: string, botDifficulty: Difficulty | null, seats: { w: SeatInfo; b: SeatInfo }, core: RoomCore) {
    this.code = code;
    this.rulesetVersion = rulesetVersion;
    this.botDifficulty = botDifficulty;
    this.seats = seats;
    this.core = core;
  }

  get phase() { return this.core.phase; }
  get game(): Game | null { return this.core.game; }
  get moves() { return this.core.moves; }
  get drawOfferBy() { return this.core.drawOfferBy; }
  get result() { return this.core.result; }

  ruleset() { return getRuleset(this.rulesetVersion)!; }

  seatByColor(c: Color): SeatInfo { return this.seats[c]; }
  seatByToken(token: string): SeatInfo | null {
    const hash = hashToken(token);
    if (this.seats.w.tokenHash === hash) return this.seats.w;
    if (this.seats.b.tokenHash === hash) return this.seats.b;
    return null;
  }

  opponentOf(c: Color): SeatInfo { return this.seats[otherColor(c)]; }

  bothReady(): boolean { return this.core.bothReady(); }

  stateFor(color: Color): GameStateWire { return this.core.stateFor(color); }
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

  private persistenceFor(code: string): RoomPersistence {
    return {
      onSetup: (color, setup) => this.db.setSeatSetup(code, color, setup),
      onGameStart: () => this.db.updateRoomStatus(code, 'playing'),
      onMove: (ply, uci) => this.db.insertMove(code, ply, uci),
      onGameOver: (result, reason) => { this.db.setResult(code, result, reason); this.db.updateRoomStatus(code, 'over'); },
    };
  }

  /** Builds a Room backed by a fresh RoomCore wired to this room's seats/db/bot. */
  private makeRoom(code: string, rulesetVersion: string, botDifficulty: Difficulty | null, seats: { w: SeatInfo; b: SeatInfo }, coreSeats: { w: { setup?: string; ready: boolean; connected?: boolean }; b: { setup?: string; ready: boolean; connected?: boolean } }, moves?: string[]): Room {
    const roomRef: { room: Room | null } = { room: null };
    const core = new RoomCore({
      code,
      rulesetVersion,
      rulesetFor: getRuleset,
      send: (color, msg) => send(roomRef.room!.seats[color].ws, msg),
      scheduler: realTimeScheduler,
      forfeitMs: this.forfeitMs,
      persistence: this.persistenceFor(code),
      seats: coreSeats,
      moves,
    });
    const room = new Room(code, rulesetVersion, botDifficulty, seats, core);
    roomRef.room = room;
    return room;
  }

  /** Rebuild in-memory rooms from SQLite by replaying moves [impl.md "Persistence"]. */
  private reloadFromDb(): void {
    for (const r of this.db.allRooms()) {
      if (r.status === 'over') continue; // finished games are not resumable, kept for history only
      const seatsRows = this.db.seatsFor(r.code);
      const wRow = seatsRows.find((s) => s.color === 'w');
      const bRow = seatsRows.find((s) => s.color === 'b');
      if (!wRow || !bRow) continue;
      const mkSeat = (color: Color, row: { token_hash: string }): SeatInfo => ({
        color, token: '', tokenHash: row.token_hash, ws: null, isBot: false,
      });
      const seats = { w: mkSeat('w', wRow), b: mkSeat('b', bRow) };
      const version = r.ruleset;
      const bot = (r.bot === 'easy' || r.bot === 'medium' || r.bot === 'hard' ? r.bot : null) as Difficulty | null;
      const movesRows = this.db.movesFor(r.code);
      const coreSeats = {
        w: { setup: wRow.setup ?? undefined, ready: !!wRow.setup, connected: false },
        b: { setup: bRow.setup ?? undefined, ready: !!bRow.setup, connected: false },
      };
      const room = this.makeRoom(r.code, version, bot, seats, coreSeats, movesRows.map((m) => m.uci));
      this.rooms.set(r.code, room);
      // Reload leaves every seat without a live connection: treat each as freshly disconnected
      // so the forfeit window starts now, matching the pre-crash behavior.
      room.core.seedDisconnected('w');
      room.core.seedDisconnected('b');
      room.core.armForfeitTimer('w');
      room.core.armForfeitTimer('b');
    }
  }

  get(code: string): Room | undefined { return this.rooms.get(code); }

  createRoom(rulesetRaw: string, hostColor: Color | undefined, bot: Difficulty | null = null): { room: Room; seat: SeatInfo } | { error: string } {
    const version = rulesetRaw;
    const ruleset = getRuleset(version);
    if (!ruleset) return { error: `unknown ruleset version '${version}'` };
    if (bot && !FsfBot.available()) return { error: 'bot engine unavailable: Fairy-Stockfish binary not found' };
    const botSetup = bot ? botProfiles[version]?.[bot] : undefined;
    if (bot && !botSetup) return { error: `no ${bot} bot profile for ruleset '${version}'` };

    let code = generateInviteCode();
    while (this.rooms.has(code)) code = generateInviteCode();

    const color: Color = hostColor ?? (Math.random() < 0.5 ? 'w' : 'b');
    const token = generateToken();
    const hostSeat: SeatInfo = { color, token, tokenHash: hashToken(token), ws: null, isBot: false };
    const otherC = otherColor(color);
    let otherSeat: SeatInfo;
    if (bot) {
      const botToken = generateToken();
      otherSeat = { color: otherC, token: botToken, tokenHash: hashToken(botToken), ws: null, isBot: true };
    } else {
      otherSeat = { color: otherC, token: '', tokenHash: '', ws: null, isBot: false };
    }
    const seats = color === 'w' ? { w: hostSeat, b: otherSeat } : { w: otherSeat, b: hostSeat };

    const coreSeats = {
      w: { ready: false } as { setup?: string; ready: boolean; connected?: boolean },
      b: { ready: false } as { setup?: string; ready: boolean; connected?: boolean },
    };
    if (bot) coreSeats[otherC] = { setup: botSetup!, ready: true, connected: true };

    const room = this.makeRoom(code, version, bot, seats, coreSeats);
    this.rooms.set(code, room);

    this.db.insertRoom(code, rulesetRaw, 'setup', bot);
    this.db.insertSeat(code, hostSeat.color, hostSeat.tokenHash);
    if (!bot) this.db.insertSeat(code, otherSeat.color, otherSeat.tokenHash);
    else { this.db.insertSeat(code, otherSeat.color, otherSeat.tokenHash); this.db.setSeatSetup(code, otherSeat.color, botSetup!); }

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
    return room.core.submitSetup(seat.color, setup);
  }

  /** Applies a legal move, persists, broadcasts, checks for game end. Returns null on success or an error reason. */
  applyMove(room: Room, color: Color, uci: string, ply: number): string | null {
    const err = room.core.applyMove(color, uci, ply);
    if (!err && room.phase === 'playing') this.maybeTriggerBot(room);
    return err;
  }

  finishGame(room: Room, result: WireResult, reason: WireReason): void {
    room.core.finishGame(result, reason);
  }

  resign(room: Room, color: Color): void {
    room.core.resign(color);
  }

  offerDraw(room: Room, color: Color): void {
    room.core.offerDraw(color);
  }

  acceptDraw(room: Room, color: Color): void {
    room.core.acceptDraw(color);
  }

  onConnect(room: Room, seat: SeatInfo, ws: WebSocket): void {
    seat.ws = ws;
    room.core.onConnect(seat.color);
  }

  onDisconnect(room: Room, seat: SeatInfo): void {
    if (this.closed) return;
    seat.ws = null;
    if (seat.isBot) return;
    room.core.onDisconnect(seat.color);
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
    for (const room of this.rooms.values()) room.core.close();
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
  const fresh = createGame(room.ruleset(), room.core.setupOf('w')!, room.core.setupOf('b')!);
  return fresh.toFEN();
}
