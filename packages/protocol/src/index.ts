/**
 * Takes client/server protocol — JSON over WebSocket [impl.md "Messages"].
 * Every state-changing client message carries the ply it expects; the server rejects stale ones.
 */
import type { Color } from '@takes/library';

export const PROTOCOL_VERSION = 1;

export interface WireIssue { severity: 'error' | 'warning'; code: string; message: string; squares: number[] }
export type WireResult = '1-0' | '0-1' | '1/2-1/2';
export type WireReason =
  | 'checkmate' | 'stalemate' | 'repetition' | 'move-cap' | 'insufficient'
  | 'resign' | 'agreement' | 'timeout' | 'abandon';

// ---- Client -> Server ----
export type ClientMsg =
  | { t: 'create_room'; ruleset: string; color?: Color }
  | { t: 'join_room'; code: string }
  | { t: 'resume'; token: string }
  | { t: 'submit_setup'; setup: string }
  | { t: 'move'; uci: string; ply: number }
  | { t: 'resign'; ply: number }
  | { t: 'offer_draw'; ply: number }
  | { t: 'accept_draw'; ply: number }
  | { t: 'ping' };

// ---- Server -> Client ----
export interface GameStateWire {
  code: string;
  ruleset: string;
  you: Color;
  phase: 'setup' | 'playing' | 'over';
  /** Own setup, if submitted. Opponent setup only once phase !== 'setup'. */
  setups: { w?: string; b?: string };
  ready: { w: boolean; b: boolean };
  moves: string[];
  fen?: string;
  drawOfferBy?: Color;
  result?: { result: WireResult; reason: WireReason };
}

export type ServerMsg =
  | { t: 'room_created'; code: string; token: string; color: Color; ruleset: string }
  | { t: 'joined'; code: string; token: string; color: Color; ruleset: string }
  | { t: 'setup_accepted' }
  | { t: 'setup_rejected'; issues: WireIssue[] }
  | { t: 'opponent_ready' }
  | { t: 'opponent_joined' }
  | { t: 'game_start'; setups: { w: string; b: string }; fen: string }
  | { t: 'move_made'; uci: string; ply: number; hash: string }
  | { t: 'move_rejected'; reason: string; ply: number }
  | { t: 'draw_offered'; by: Color }
  | { t: 'game_over'; result: WireResult; reason: WireReason }
  | { t: 'state'; state: GameStateWire }
  | { t: 'opponent_connection'; connected: boolean; forfeitInMs?: number }
  | { t: 'error'; code: 'bad_message' | 'no_room' | 'room_full' | 'bad_token' | 'wrong_phase' | 'stale_ply' | 'not_your_turn'; message: string }
  | { t: 'pong' };

const CLIENT_TYPES = new Set(['create_room', 'join_room', 'resume', 'submit_setup', 'move', 'resign', 'offer_draw', 'accept_draw', 'ping']);

/** Invite code alphabet: no 0/O/1/I/L/U [impl.md "Room lifecycle"]. */
export const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_LENGTH = 8;
export const isInviteCode = (s: unknown): s is string =>
  typeof s === 'string' && s.length === INVITE_LENGTH && [...s].every((c) => INVITE_ALPHABET.includes(c));

/** Structural validation of untrusted client input. Returns null if malformed. */
export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > 4096) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  if (typeof o.t !== 'string' || !CLIENT_TYPES.has(o.t)) return null;
  const isPly = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
  switch (o.t) {
    case 'create_room':
      if (typeof o.ruleset !== 'string' || (o.color !== undefined && o.color !== 'w' && o.color !== 'b')) return null;
      return o.color ? { t: 'create_room', ruleset: o.ruleset, color: o.color as Color } : { t: 'create_room', ruleset: o.ruleset };
    case 'join_room': return isInviteCode(o.code) ? { t: 'join_room', code: o.code } : null;
    case 'resume': return typeof o.token === 'string' && o.token.length <= 128 ? { t: 'resume', token: o.token } : null;
    case 'submit_setup': return typeof o.setup === 'string' && o.setup.length <= 512 ? { t: 'submit_setup', setup: o.setup } : null;
    case 'move': return typeof o.uci === 'string' && /^[a-h][1-8][a-h][1-8][a-z]?$/.test(o.uci) && isPly(o.ply) ? { t: 'move', uci: o.uci, ply: o.ply as number } : null;
    case 'resign': case 'offer_draw': case 'accept_draw': return isPly(o.ply) ? { t: o.t, ply: o.ply as number } : null;
    case 'ping': return { t: 'ping' };
  }
  return null;
}
