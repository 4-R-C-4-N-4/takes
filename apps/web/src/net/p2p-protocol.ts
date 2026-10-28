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
      if (!isHex(o.hash)) return null;
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
      if (!o.msg || typeof o.msg !== 'object') return null;
      return { v: 1, t: 'server', msg: o.msg as ServerMsg };
    case 'resync':
      if (!Array.isArray(o.moves) || !o.moves.every((m) => typeof m === 'string')) return null;
      return { v: 1, t: 'resync', moves: o.moves as string[], result: (o.result as { result: string; reason: string } | null | undefined) ?? null };
    default:
      return null;
  }
}

export type { WireIssue };
