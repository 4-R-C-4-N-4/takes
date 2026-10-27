/** SQLite persistence [impl.md "Persistence"]. Tables: rooms, seats, moves, results. */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

export type DB = ReturnType<typeof openDb>;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function openDb(path: string): {
  raw: Database.Database;
  insertRoom(code: string, ruleset: string, status: string, bot: string | null): void;
  updateRoomStatus(code: string, status: string): void;
  insertSeat(room: string, color: string, tokenHash: string): void;
  setSeatSetup(room: string, color: string, setup: string): void;
  insertMove(room: string, ply: number, uci: string): void;
  setResult(room: string, result: string, reason: string): void;
  allRooms(): Array<{ code: string; ruleset: string; status: string; bot: string | null }>;
  seatsFor(room: string): Array<{ color: string; token_hash: string; setup: string | null }>;
  movesFor(room: string): Array<{ ply: number; uci: string }>;
  resultFor(room: string): { result: string; reason: string } | undefined;
  updateSeatToken(room: string, color: string, tokenHash: string): void;
  close(): void;
} {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      ruleset TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      bot TEXT
    );
    CREATE TABLE IF NOT EXISTS seats (
      room TEXT NOT NULL,
      color TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      setup TEXT,
      PRIMARY KEY (room, color)
    );
    CREATE TABLE IF NOT EXISTS moves (
      room TEXT NOT NULL,
      ply INTEGER NOT NULL,
      uci TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (room, ply)
    );
    CREATE TABLE IF NOT EXISTS results (
      room TEXT PRIMARY KEY,
      result TEXT NOT NULL,
      reason TEXT NOT NULL
    );
  `);

  return {
    raw: db,
    insertRoom(code: string, ruleset: string, status: string, bot: string | null) {
      db.prepare('INSERT INTO rooms (code, ruleset, status, created_at, bot) VALUES (?, ?, ?, ?, ?)')
        .run(code, ruleset, status, Date.now(), bot);
    },
    updateRoomStatus(code: string, status: string) {
      db.prepare('UPDATE rooms SET status = ? WHERE code = ?').run(status, code);
    },
    insertSeat(room: string, color: string, tokenHash: string) {
      db.prepare('INSERT INTO seats (room, color, token_hash, setup) VALUES (?, ?, ?, NULL)').run(room, color, tokenHash);
    },
    updateSeatToken(room: string, color: string, tokenHash: string) {
      db.prepare('UPDATE seats SET token_hash = ? WHERE room = ? AND color = ?').run(tokenHash, room, color);
    },
    setSeatSetup(room: string, color: string, setup: string) {
      db.prepare('UPDATE seats SET setup = ? WHERE room = ? AND color = ?').run(setup, room, color);
    },
    insertMove(room: string, ply: number, uci: string) {
      db.prepare('INSERT INTO moves (room, ply, uci, at) VALUES (?, ?, ?, ?)').run(room, ply, uci, Date.now());
    },
    setResult(room: string, result: string, reason: string) {
      db.prepare('INSERT OR REPLACE INTO results (room, result, reason) VALUES (?, ?, ?)').run(room, result, reason);
    },
    allRooms(): Array<{ code: string; ruleset: string; status: string; bot: string | null }> {
      return db.prepare('SELECT code, ruleset, status, bot FROM rooms').all() as Array<{ code: string; ruleset: string; status: string; bot: string | null }>;
    },
    seatsFor(room: string): Array<{ color: string; token_hash: string; setup: string | null }> {
      return db.prepare('SELECT color, token_hash, setup FROM seats WHERE room = ?').all(room) as Array<{ color: string; token_hash: string; setup: string | null }>;
    },
    movesFor(room: string): Array<{ ply: number; uci: string }> {
      return db.prepare('SELECT ply, uci FROM moves WHERE room = ? ORDER BY ply ASC').all(room) as Array<{ ply: number; uci: string }>;
    },
    resultFor(room: string): { result: string; reason: string } | undefined {
      return db.prepare('SELECT result, reason FROM results WHERE room = ?').get(room) as { result: string; reason: string } | undefined;
    },
    close() {
      db.close();
    },
  };
}
