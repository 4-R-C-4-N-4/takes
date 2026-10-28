/**
 * HostSession: runs RoomCore in the host's own browser (forfeit timer disabled — a missing
 * guest never auto-loses while the host tab is open). Exposes an OnlineTransport for the
 * host's own UI (pure loopback, no serialization) and serves the guest over a PeerLink.
 *
 * Commit-reveal: the host commits to its setup the moment it submits it (sent over the link
 * immediately, before RoomCore even sees it). It only accepts the guest's submit_setup once the
 * guest's commit hash has arrived AND the guest's later revealed (setup, salt) matches that
 * commit. The host's own (setup, salt) reveal is sent right before the game_start frame reaches
 * the guest — i.e. only once the guest's army is already locked in, so neither side can adjust
 * its army after seeing the other's.
 */
import type { Color, Ruleset } from '@takes/library';
import type { ClientMsg, ServerMsg, WireReason, WireResult } from '@takes/protocol';
import { RoomCore, noopScheduler, type InitialSeatState, type RoomPersistence } from '@takes/room';
import { commitSetup, randomSaltHex, verifyCommit } from './commit-reveal.js';
import { parsePeerFrame, PEER_PROTOCOL_VERSION, type PeerFrame } from './p2p-protocol.js';
import type { PeerLink } from './peer-link.js';
import type { OnlineTransport, TransportStatus } from './transport.js';

export interface P2PStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function storageKey(code: string): string { return `takes.p2p.${code}`; }

/** Persisted shape for both host and guest; fields not relevant to a role are left undefined. */
export interface P2PStoredState {
  role: 'host' | 'guest';
  color: Color;
  mySetup?: string;
  salt?: string;
  opponentCommit?: string;
  /** The host's revealed setup, as verified by the guest (or, on the host, its own setup). */
  hostSetup?: string;
  /** Host-only: the guest's verified setup, needed to rebuild RoomCore's seats on reload. */
  peerSetup?: string;
  moves: string[];
  result?: { result: WireResult; reason: WireReason } | null;
}

export interface HostSessionOpts {
  code: string;
  ruleset: string;
  rulesetFor: (version: string) => Ruleset | undefined;
  link: PeerLink;
  forfeitMs?: number;
  storage?: P2PStorageLike;
  persistence?: RoomPersistence;
  /** For reload/resume: reconstruct RoomCore with these seats/moves instead of starting fresh. */
  seats?: { w: InitialSeatState; b: InitialSeatState };
  moves?: string[];
  /** For reload/resume: the host's own already-committed setup + salt. */
  resumeCommit?: { setup: string; salt: string; guestCommitHash?: string | null; guestSetup?: string | null };
}

export class HostSession {
  readonly transport: OnlineTransport;
  readonly code: string;
  private readonly ruleset: string;
  private readonly link: PeerLink;
  private readonly core: RoomCore;
  private readonly storage: P2PStorageLike | null;

  private mySetup: string | null = null;
  private mySalt: string | null = null;
  private guestCommitHash: string | null = null;
  private guestSetup: string | null = null;
  private closed = false;
  /** Serializes frame handling so e.g. a commit always finishes being applied before the next frame. */
  private frameQueue: Promise<void> = Promise.resolve();

  private readonly serverListeners = new Set<(msg: ServerMsg) => void>();
  private readonly statusListeners = new Set<(status: TransportStatus) => void>();
  private readonly unsubFrame: () => void;
  private readonly unsubPeer: () => void;

  constructor(opts: HostSessionOpts) {
    this.code = opts.code;
    this.ruleset = opts.ruleset;
    this.link = opts.link;
    this.storage = opts.storage ?? null;
    if (opts.resumeCommit) {
      this.mySetup = opts.resumeCommit.setup;
      this.mySalt = opts.resumeCommit.salt;
      this.guestCommitHash = opts.resumeCommit.guestCommitHash ?? null;
      this.guestSetup = opts.resumeCommit.guestSetup ?? null;
    }
    this.core = new RoomCore({
      code: opts.code,
      rulesetVersion: opts.ruleset,
      rulesetFor: opts.rulesetFor,
      forfeitMs: opts.forfeitMs ?? Number.POSITIVE_INFINITY,
      scheduler: noopScheduler,
      send: (color, msg) => this.routeServerMsg(color, msg),
      seats: opts.seats,
      moves: opts.moves,
      persistence: opts.persistence,
    });
    this.transport = {
      send: (msg) => this.handleHostClientMsg(msg),
      onMessage: (cb) => { this.serverListeners.add(cb); return () => this.serverListeners.delete(cb); },
      onStatus: (cb) => { this.statusListeners.add(cb); cb('open'); return () => this.statusListeners.delete(cb); },
      close: () => {},
    };
    this.unsubFrame = this.link.onFrame((raw) => { this.frameQueue = this.frameQueue.then(() => this.onFrame(raw)); });
    this.unsubPeer = this.link.onPeer((event) => { if (event === 'join') this.onGuestJoin(); });
  }

  /** Rebuilds a HostSession from localStorage after a page reload mid-game. */
  static fromStorage(opts: Omit<HostSessionOpts, 'seats' | 'moves' | 'resumeCommit'> & { storage: P2PStorageLike }): HostSession | null {
    const raw = opts.storage.getItem(storageKey(opts.code));
    if (!raw) return null;
    let s: P2PStoredState;
    try { s = JSON.parse(raw); } catch { return null; }
    if (s.role !== 'host') return null;
    const seats = {
      w: { setup: s.mySetup, ready: !!s.mySetup, connected: true },
      b: { setup: s.peerSetup, ready: !!s.peerSetup, connected: false },
    };
    return new HostSession({
      ...opts,
      seats,
      moves: s.moves,
      resumeCommit: s.mySetup && s.salt ? { setup: s.mySetup, salt: s.salt, guestCommitHash: s.opponentCommit, guestSetup: s.peerSetup } : undefined,
    });
  }

  private onGuestJoin(): void {
    this.link.send({ v: 1, t: 'hello', app: 'takes', protocol: PEER_PROTOCOL_VERSION, ruleset: this.ruleset });
    if (this.core.phase !== 'setup') {
      this.link.send({ v: 1, t: 'resync', moves: [...this.core.moves], result: this.core.result ?? null });
    }
  }

  private routeServerMsg(color: Color, msg: ServerMsg): void {
    if (color === 'w') {
      this.serverListeners.forEach((f) => f(msg));
    } else {
      if (msg.t === 'game_start' && this.mySetup && this.mySalt) {
        this.link.send({ v: 1, t: 'host-reveal', setup: this.mySetup, salt: this.mySalt });
      }
      this.link.send({ v: 1, t: 'server', msg });
    }
    this.persist();
  }

  private handleHostClientMsg(msg: ClientMsg): void {
    if (msg.t === 'submit_setup') { void this.hostSubmitSetup(msg.setup); return; }
    this.applyColorMsg('w', msg);
  }

  private async hostSubmitSetup(setup: string): Promise<void> {
    this.mySetup = setup;
    this.mySalt = randomSaltHex();
    const hash = await commitSetup(setup, this.mySalt);
    if (this.closed) return;
    this.link.send({ v: 1, t: 'commit', hash });
    const issues = this.core.submitSetup('w', setup);
    if (issues) { this.serverListeners.forEach((f) => f({ t: 'setup_rejected', issues })); return; }
    this.serverListeners.forEach((f) => f({ t: 'setup_accepted' }));
  }

  private applyColorMsg(color: Color, msg: ClientMsg): void {
    switch (msg.t) {
      case 'move': {
        const err = this.core.applyMove(color, msg.uci, msg.ply);
        if (err) this.sendTo(color, { t: 'move_rejected', reason: err, ply: msg.ply });
        return;
      }
      case 'resign': this.core.resign(color); return;
      case 'offer_draw': this.core.offerDraw(color); return;
      case 'accept_draw': this.core.acceptDraw(color); return;
      case 'ping': this.sendTo(color, { t: 'pong' }); return;
      default: return;
    }
  }

  private sendTo(color: Color, msg: ServerMsg): void {
    if (color === 'w') this.serverListeners.forEach((f) => f(msg));
    else this.link.send({ v: 1, t: 'server', msg });
  }

  private async onFrame(raw: unknown): Promise<void> {
    const f: PeerFrame | null = parsePeerFrame(raw);
    if (!f) return; // malformed frame: ignored, host keeps running
    switch (f.t) {
      case 'hello':
        if (f.app !== 'takes' || f.protocol !== PEER_PROTOCOL_VERSION) {
          this.link.send({ v: 1, t: 'server', msg: { t: 'error', code: 'bad_message', message: 'protocol version mismatch' } });
        }
        return;
      case 'commit':
        this.guestCommitHash = f.hash;
        return;
      case 'guest-setup': {
        if (!this.guestCommitHash) return; // no commit on file: ignore (guest must commit first)
        const ok = await verifyCommit(f.setup, f.salt, this.guestCommitHash);
        if (!ok) {
          this.link.send({ v: 1, t: 'server', msg: { t: 'error', code: 'bad_message', message: "opponent's client cheated (setup mismatch)" } });
          return;
        }
        this.guestSetup = f.setup;
        this.persist();
        const issues = this.core.submitSetup('b', f.setup);
        if (issues) { this.link.send({ v: 1, t: 'server', msg: { t: 'setup_rejected', issues } }); return; }
        this.link.send({ v: 1, t: 'server', msg: { t: 'setup_accepted' } });
        return;
      }
      case 'client':
        this.applyColorMsg('b', f.msg);
        return;
      default:
        return;
    }
  }

  private persist(): void {
    if (!this.storage) return;
    const state: P2PStoredState = {
      role: 'host', color: 'w',
      mySetup: this.mySetup ?? undefined,
      salt: this.mySalt ?? undefined,
      opponentCommit: this.guestCommitHash ?? undefined,
      hostSetup: this.mySetup ?? undefined,
      peerSetup: this.guestSetup ?? undefined,
      moves: [...this.core.moves],
      result: this.core.result,
    };
    try { this.storage.setItem(storageKey(this.code), JSON.stringify(state)); } catch { /* ignore */ }
  }

  close(): void {
    this.closed = true;
    this.unsubFrame();
    this.unsubPeer();
    this.core.close();
    this.link.close();
  }
}
