/**
 * Static-build P2P session wiring: turns a HostSession/GuestSession into the
 * `OnlineTransport & { connect() }` shape OnlineGameController expects, and tracks the
 * connection-lifecycle status the UI needs to show (relay connect -> waiting for a peer ->
 * connected, plus a could-not-connect timeout when a peer never opens a data channel).
 *
 * Trystero (and its WebRTC/BitTorrent-tracker signalling) is only ever pulled in via the
 * dynamic import inside joinTrysteroLink — nothing here imports it eagerly, so vs-CPU/hotseat/
 * Builder/Library routes never load it.
 */
import { INVITE_ALPHABET, INVITE_LENGTH } from '@takes/protocol';
import type { Color } from '@takes/library';
import { getRuleset, type Ruleset } from '@takes/library';
import { createGame, type Game } from '@takes/engine';
import { GuestSession } from './p2p-guest.js';
import { HostSession, storageKey, type P2PStorageLike, type P2PStoredState } from './p2p-host.js';
import { joinTrysteroLink } from './peer-link.js';
import type { OnlineTransport } from './transport.js';

/** Random invite code drawn from the same alphabet/length the server uses, via WebCrypto. */
export function generateP2PCode(): string {
  const bytes = new Uint8Array(INVITE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < INVITE_LENGTH; i++) out += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length];
  return out;
}

const rulesetFor = (v: string): Ruleset | undefined => getRuleset(v);

export type P2PStatus =
  | 'connecting' // joining the relay room
  | 'waiting' // in the room, no peer yet
  | 'connected' // peer joined, data channel open
  | 'could-not-connect' // peer presence/room seen but no channel within the timeout
  | 'peer-left'; // the peer's connection dropped after being connected

export interface P2PHandle {
  code: string;
  role: 'host' | 'guest';
  transport: OnlineTransport & { connect(): void };
  getStatus(): P2PStatus;
  onStatus(cb: (s: P2PStatus) => void): () => void;
  close(): void;
}

const NO_PEER_TIMEOUT_MS = 25_000;

function wrapTransport(inner: OnlineTransport): OnlineTransport & { connect(): void } {
  return { ...inner, connect: () => {} };
}

function trackStatus(
  onPeer: (cb: (ok: boolean) => void) => void,
): { getStatus: () => P2PStatus; onStatus: (cb: (s: P2PStatus) => void) => () => void; stop: () => void } {
  let status: P2PStatus = 'connecting';
  const listeners = new Set<(s: P2PStatus) => void>();
  let everConnected = false;
  const set = (s: P2PStatus) => { status = s; listeners.forEach((f) => f(s)); };
  set('waiting');
  const timer = setTimeout(() => { if (status === 'waiting') set('could-not-connect'); }, NO_PEER_TIMEOUT_MS);
  onPeer((joined) => {
    if (joined) { everConnected = true; clearTimeout(timer); set('connected'); }
    else if (everConnected) set('peer-left');
  });
  return {
    getStatus: () => status,
    onStatus: (cb) => { listeners.add(cb); cb(status); return () => listeners.delete(cb); },
    stop: () => clearTimeout(timer),
  };
}

export interface HostP2POpts {
  code: string;
  ruleset: string;
  setup: string;
  forfeitMs?: number;
  storage?: P2PStorageLike;
}

export async function createHostSession(opts: HostP2POpts): Promise<P2PHandle> {
  const link = await joinTrysteroLink(opts.code);
  const storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const host = new HostSession({ code: opts.code, ruleset: opts.ruleset, rulesetFor, link, forfeitMs: opts.forfeitMs, storage });
  const tracking = trackStatus((cb) => link.onPeer((ev) => cb(ev === 'join')));
  const handle: P2PHandle = {
    code: opts.code,
    role: 'host',
    transport: wrapTransport(host.transport),
    getStatus: tracking.getStatus,
    onStatus: tracking.onStatus,
    close: () => { tracking.stop(); host.close(); },
  };
  return handle;
}

export interface GuestP2POpts {
  code: string;
  ruleset: string;
  setup: string;
  storage?: P2PStorageLike;
}

export async function createGuestSession(opts: GuestP2POpts): Promise<P2PHandle> {
  const link = await joinTrysteroLink(opts.code);
  const storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const guest = new GuestSession({ code: opts.code, ruleset: opts.ruleset, rulesetFor, link, storage });
  const tracking = trackStatus((cb) => link.onPeer((ev) => cb(ev === 'join')));
  const handle: P2PHandle = {
    code: opts.code,
    role: 'guest',
    transport: wrapTransport(guest.transport),
    getStatus: tracking.getStatus,
    onStatus: tracking.onStatus,
    close: () => { tracking.stop(); guest.close(); },
  };
  return handle;
}

/** True if there is a resumable P2P session recorded locally for this code. */
export function hasStoredP2PSession(code: string, storage: P2PStorageLike = localStorage): boolean {
  try { return !!storage.getItem(storageKey(code)); } catch { return false; }
}

export function storedP2PRole(code: string, storage: P2PStorageLike = localStorage): 'host' | 'guest' | null {
  try {
    const raw = storage.getItem(storageKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role?: 'host' | 'guest' };
    return parsed.role ?? null;
  } catch { return null; }
}

/** Snapshot fields the UI needs right after a reload, read straight out of localStorage without
 *  touching the (not-yet-reconnected) session — used so the board/result show up instantly while
 *  joinTrysteroLink reconnects to the relay in the background. */
export interface P2PResumeSnapshot {
  code: string; color: Color; ruleset: string; mySetup: string | null; opponentReady: boolean;
  game: Game | null; result: { result: string; reason: string } | null;
  phase: 'setup-wait' | 'playing' | 'over';
}

export function buildResumeSnapshot(code: string, ruleset: string, storage: P2PStorageLike = localStorage): P2PResumeSnapshot | null {
  let raw: string | null;
  try { raw = storage.getItem(storageKey(code)); } catch { raw = null; }
  if (!raw) return null;
  let s: P2PStoredState;
  try { s = JSON.parse(raw); } catch { return null; }
  const color: Color = s.role === 'host' ? 'w' : 'b';
  const whiteSetup = s.role === 'host' ? s.mySetup : s.hostSetup;
  const blackSetup = s.role === 'host' ? s.peerSetup : s.mySetup;
  const opponentReady = s.role === 'host' ? !!s.peerSetup : !!s.hostSetup;
  let game: Game | null = null;
  const rs = rulesetFor(ruleset);
  if (rs && whiteSetup && blackSetup) {
    try {
      game = createGame(rs, whiteSetup, blackSetup);
      for (const uci of s.moves ?? []) {
        const mv = game.parseUci(uci);
        if (!mv) { game = null; break; }
        game.make(mv);
      }
    } catch { game = null; }
  }
  const phase: 'setup-wait' | 'playing' | 'over' = s.result ? 'over' : game ? 'playing' : 'setup-wait';
  return { code, color, ruleset, mySetup: s.mySetup ?? null, opponentReady, game, result: s.result ?? null, phase };
}

export interface ResumeP2POpts {
  code: string;
  ruleset: string;
  storage?: P2PStorageLike;
}

export async function resumeP2PSession(opts: ResumeP2POpts): Promise<P2PHandle | null> {
  const storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!storage) return null;
  const role = storedP2PRole(opts.code, storage);
  if (!role) return null;
  const link = await joinTrysteroLink(opts.code);
  const tracking = trackStatus((cb) => link.onPeer((ev) => cb(ev === 'join')));
  if (role === 'host') {
    const host = HostSession.fromStorage({ code: opts.code, ruleset: opts.ruleset, rulesetFor, link, storage });
    if (!host) return null;
    return {
      code: opts.code, role: 'host', transport: wrapTransport(host.transport),
      getStatus: tracking.getStatus, onStatus: tracking.onStatus,
      close: () => { tracking.stop(); host.close(); },
    };
  }
  const guest = GuestSession.fromStorage({ code: opts.code, ruleset: opts.ruleset, rulesetFor, link, storage });
  if (!guest) return null;
  return {
    code: opts.code, role: 'guest', transport: wrapTransport(guest.transport),
    getStatus: tracking.getStatus, onStatus: tracking.onStatus,
    close: () => { tracking.stop(); guest.close(); },
  };
}
