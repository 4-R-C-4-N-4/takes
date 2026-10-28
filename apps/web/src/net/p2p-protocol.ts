/**
 * Versioned, validated wire protocol for the P2P link between host and guest browsers.
 * Everything that crosses the PeerLink is a PeerFrame; parsePeerFrame rejects anything else so
 * a malformed/malicious frame from a peer never reaches HostSession/GuestSession as typed data.
 */
import type { ClientMsg, ServerMsg, WireIssue } from '@takes/protocol';
import { parseClientMsg } from '@takes/protocol';

export const PEER_PROTOCOL_VERSION = 1;

export type PeerFrame =
  | { v: 1; t: 'hello'; app: 'takes'; protocol: number; ruleset: string }
  | { v: 1; t: 'commit'; hash: string }
  /** The guest's reveal of its own (setup, salt) — sent only after the host's commit arrived. */
  | { v: 1; t: 'guest-setup'; setup: string; salt: string }
  | { v: 1; t: 'client'; msg: ClientMsg }
  | { v: 1; t: 'server'; msg: ServerMsg }
  /** The host's reveal of its own (setup, salt); sent just before the game_start server frame. */
  | { v: 1; t: 'host-reveal'; setup: string; salt: string }
  | { v: 1; t: 'resync'; moves: string[]; result?: { result: string; reason: string } | null };

function isHex(s: unknown): s is string { return typeof s === 'string' && /^[0-9a-f]+$/.test(s) && s.length <= 256; }
function isSetup(s: unknown): s is string { return typeof s === 'string' && s.length <= 512; }

const isPly = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isUci = (v: unknown): v is string => typeof v === 'string' && /^[a-h][1-8][a-h][1-8][a-z]?$/.test(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= 4096;
function isResult(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return ['1-0', '0-1', '1/2-1/2'].includes(o.result as string) &&
    ['checkmate', 'stalemate', 'repetition', 'move-cap', 'insufficient', 'resign', 'agreement', 'timeout', 'abandon'].includes(o.reason as string);
}
/** Only messages used by the P2P host are accepted; server-only routing/token messages cannot
 * overwrite the guest's identity or inject an unverified state snapshot. */
function isServerMsg(v: unknown): v is ServerMsg {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  switch (o.t) {
    case 'setup_accepted': case 'opponent_ready': case 'opponent_joined': case 'pong': return true;
    case 'game_start': {
      const setups = o.setups as Record<string, unknown> | null;
      return !!setups && isSetup(setups.w) && isSetup(setups.b) && isText(o.fen);
    }
    case 'move_made': return isUci(o.uci) && isPly(o.ply) && isText(o.hash);
    case 'move_rejected': return isText(o.reason) && isPly(o.ply);
    case 'draw_offered': return o.by === 'w' || o.by === 'b';
    case 'game_over': return isResult(o);
    case 'opponent_connection': return typeof o.connected === 'boolean' && (o.forfeitInMs === undefined || (typeof o.forfeitInMs === 'number' && Number.isFinite(o.forfeitInMs) && o.forfeitInMs >= 0));
    case 'error': return ['bad_message', 'no_room', 'room_full', 'bad_token', 'wrong_phase', 'stale_ply', 'not_your_turn'].includes(o.code as string) && isText(o.message);
    case 'setup_rejected': return Array.isArray(o.issues) && o.issues.length <= 512 && o.issues.every((issue) => {
      if (!issue || typeof issue !== 'object') return false;
      return ['error', 'warning'].includes(issue.severity) && isText(issue.code) && isText(issue.message) && Array.isArray(issue.squares) && issue.squares.every((sq: unknown) => isPly(sq) && sq < 64);
    });
    default: return false;
  }
}

/** Structural validation of untrusted peer input. Returns null if malformed. */
export function parsePeerFrame(raw: unknown): PeerFrame | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.t !== 'string') return null;
  switch (o.t) {
    case 'hello':
      if (o.app !== 'takes' || typeof o.protocol !== 'number' || typeof o.ruleset !== 'string' || o.ruleset.length > 32) return null;
      return { v: 1, t: 'hello', app: 'takes', protocol: o.protocol, ruleset: o.ruleset };
    case 'commit':
      if (!isHex(o.hash) || o.hash.length !== 64) return null;
      return { v: 1, t: 'commit', hash: o.hash };
    case 'guest-setup':
      if (!isSetup(o.setup) || !isHex(o.salt)) return null;
      return { v: 1, t: 'guest-setup', setup: o.setup, salt: o.salt };
    case 'host-reveal':
      if (!isSetup(o.setup) || !isHex(o.salt)) return null;
      return { v: 1, t: 'host-reveal', setup: o.setup, salt: o.salt };
    case 'client': {
      if (!o.msg || typeof o.msg !== 'object') return null;
      let serialized: string;
      try { serialized = JSON.stringify(o.msg); } catch { return null; }
      const parsed = parseClientMsg(serialized);
      if (!parsed) return null;
      return { v: 1, t: 'client', msg: parsed };
    }
    case 'server':
      if (!isServerMsg(o.msg)) return null;
      return { v: 1, t: 'server', msg: o.msg };
    case 'resync':
      if (!Array.isArray(o.moves) || o.moves.length > 10000 || !o.moves.every(isUci) || (o.result != null && !isResult(o.result))) return null;
      return { v: 1, t: 'resync', moves: o.moves as string[], result: (o.result as { result: string; reason: string } | null | undefined) ?? null };
    default:
      return null;
  }
}

export type { WireIssue };
