/**
 * GuestSession: an OnlineTransport for the guest UI backed entirely by a PeerLink to the host.
 * The guest never trusts the host's RoomCore blindly: it keeps its own @takes/engine Game,
 * replays every move_made locally (checking legality + hash), and verifies the host's setup
 * against the host's earlier commit before ever starting its local game. Any mismatch — bad
 * commit, illegal move, wrong hash, unknown ruleset — becomes a terminal 'error' ServerMsg;
 * the guest never applies a move optimistically or otherwise without this verification.
 */
import { createGame, type Game } from '@takes/engine';
import type { Color, Ruleset } from '@takes/library';
import type { ClientMsg, ServerMsg, WireReason, WireResult } from '@takes/protocol';
import { commitSetup, randomSaltHex, verifyCommit } from './commit-reveal.js';
import { parsePeerFrame, PEER_PROTOCOL_VERSION, type PeerFrame } from './p2p-protocol.js';
import type { PeerLink } from './peer-link.js';
import { storageKey, type P2PStorageLike, type P2PStoredState } from './p2p-host.js';
import type { OnlineTransport, TransportStatus } from './transport.js';

export interface GuestSessionOpts {
  code: string;
  ruleset: string;
  rulesetFor: (version: string) => Ruleset | undefined;
  link: PeerLink;
  storage?: P2PStorageLike;
  /** For reload/resume: restore a verified in-flight game instead of starting fresh. */
  resume?: {
    mySetup: string; mySalt: string; myCommit: string;
    hostCommitHash: string; hostSetup: string; moves: string[];
    result?: { result: WireResult; reason: WireReason } | null;
  };
}

export class GuestSession {
  readonly transport: OnlineTransport;
  readonly code: string;
  private readonly ruleset: string;
  private readonly link: PeerLink;
  private readonly rulesetFor: (version: string) => Ruleset | undefined;
  private readonly storage: P2PStorageLike | null;

  private pendingSetup: string | null = null;
  private mySalt: string | null = null;
  private myCommitSent = false;
  private revealed = false;
  private hostCommitHash: string | null = null;
  private hostSetup: string | null = null;
  private game: Game | null = null;
  private moves: string[] = [];
  private result: { result: WireResult; reason: WireReason } | null = null;
  private terminal = false;
  /** Serializes frame handling so e.g. a host-reveal always finishes verifying before game_start is processed. */
  private frameQueue: Promise<void> = Promise.resolve();

  private readonly serverListeners = new Set<(msg: ServerMsg) => void>();
  private readonly statusListeners = new Set<(status: TransportStatus) => void>();

  constructor(opts: GuestSessionOpts) {
    this.code = opts.code;
    this.ruleset = opts.ruleset;
    this.link = opts.link;
    this.rulesetFor = opts.rulesetFor;
    this.storage = opts.storage ?? null;

    if (opts.resume) {
      this.pendingSetup = opts.resume.mySetup;
      this.mySalt = opts.resume.mySalt;
      this.myCommitSent = true;
      this.revealed = true;
      this.hostCommitHash = opts.resume.hostCommitHash;
      this.hostSetup = opts.resume.hostSetup;
      this.moves = [...opts.resume.moves];
      this.result = opts.resume.result ?? null;
      const rs = this.rulesetFor(this.ruleset);
      if (rs) {
        this.game = createGame(rs, opts.resume.hostSetup, opts.resume.mySetup);
        for (const uci of opts.resume.moves) {
          const move = this.game.parseUci(uci);
          if (!move) { this.game = null; break; }
          this.game.make(move);
        }
      }
    }

    this.transport = {
      send: (msg) => this.handleGuestClientMsg(msg),
      onMessage: (cb) => { this.serverListeners.add(cb); return () => this.serverListeners.delete(cb); },
      onStatus: (cb) => { this.statusListeners.add(cb); cb('open'); return () => this.statusListeners.delete(cb); },
      close: () => {},
    };
    this.link.onFrame((raw) => { this.frameQueue = this.frameQueue.then(() => this.onFrame(raw)); });
    this.link.onPeer((event) => {
      if (event === 'join') {
        this.link.send({ v: 1, t: 'hello', app: 'takes', protocol: PEER_PROTOCOL_VERSION, ruleset: this.ruleset });
        if (opts.resume && this.pendingSetup && this.mySalt) {
          void commitSetup(this.pendingSetup, this.mySalt).then((hash) => this.link.send({ v: 1, t: 'commit', hash }));
        }
      }
    });
  }

  /** Guest reconstruction helper: host/guest setups are two separate strings, both needed to rebuild the engine. */

  /** Rebuilds a GuestSession from localStorage after a page reload mid-game. */
  static fromStorage(opts: Omit<GuestSessionOpts, 'resume'> & { storage: P2PStorageLike }): GuestSession | null {
    const raw = opts.storage.getItem(storageKey(opts.code));
    if (!raw) return null;
    let s: P2PStoredState;
    try { s = JSON.parse(raw); } catch { return null; }
    if (s.role !== 'guest' || !s.mySetup || !s.salt || !s.opponentCommit || !s.hostSetup) return null;
    return new GuestSession({
      ...opts,
      resume: {
        mySetup: s.mySetup, mySalt: s.salt, myCommit: '', hostCommitHash: s.opponentCommit,
        hostSetup: s.hostSetup, moves: s.moves, result: s.result ?? null,
      },
    });
  }

  private terminalError(message: string): void {
    if (this.terminal) return;
    this.terminal = true;
    this.serverListeners.forEach((f) => f({ t: 'error', code: 'bad_message', message }));
  }

  private handleGuestClientMsg(msg: ClientMsg): void {
    if (this.terminal) return;
    if (msg.t === 'submit_setup') { void this.guestSubmitSetup(msg.setup); return; }
    this.link.send({ v: 1, t: 'client', msg });
  }

  private async guestSubmitSetup(setup: string): Promise<void> {
    this.pendingSetup = setup;
    this.mySalt = randomSaltHex();
    const hash = await commitSetup(setup, this.mySalt);
    this.link.send({ v: 1, t: 'commit', hash });
    this.myCommitSent = true;
    this.persist();
    await this.revealIfReady();
  }

  private async revealIfReady(): Promise<void> {
    if (this.revealed || !this.myCommitSent || !this.pendingSetup || !this.mySalt || !this.hostCommitHash) return;
    this.revealed = true;
    this.link.send({ v: 1, t: 'guest-setup', setup: this.pendingSetup, salt: this.mySalt });
  }

  private async onFrame(raw: unknown): Promise<void> {
    if (this.terminal) return;
    const f: PeerFrame | null = parsePeerFrame(raw);
    if (!f) return; // malformed frame from host: ignored
    switch (f.t) {
      case 'hello':
        if (f.app !== 'takes' || f.protocol !== PEER_PROTOCOL_VERSION) this.terminalError('protocol version mismatch');
        return;
      case 'commit':
        this.hostCommitHash = f.hash;
        this.persist();
        await this.revealIfReady();
        return;
      case 'host-reveal': {
        if (!this.hostCommitHash || !(await verifyCommit(f.setup, f.salt, this.hostCommitHash))) {
          this.terminalError("opponent's client cheated (setup mismatch)");
          return;
        }
        this.hostSetup = f.setup;
        this.persist();
        return;
      }
      case 'resync':
        this.handleResync(f.moves, f.result ?? null);
        return;
      case 'server':
        this.handleServerMsg(f.msg);
        return;
      default:
        return;
    }
  }

  private handleServerMsg(msg: ServerMsg): void {
    switch (msg.t) {
      case 'game_start': {
        if (!this.hostSetup || msg.setups.w !== this.hostSetup) {
          this.terminalError("opponent's client cheated (setup mismatch)");
          return;
        }
        const rs = this.rulesetFor(this.ruleset);
        if (!rs) { this.terminalError('unknown ruleset'); return; }
        try {
          this.game = createGame(rs, msg.setups.w, msg.setups.b);
        } catch {
          this.terminalError("opponent's client cheated (setup mismatch)");
          return;
        }
        this.moves = [];
        this.persist();
        this.serverListeners.forEach((f) => f(msg));
        return;
      }
      case 'move_made': {
        if (!this.game) return;
        const move = this.game.parseUci(msg.uci);
        if (!move) { this.terminalError("opponent's client cheated (illegal move)"); return; }
        this.game.make(move);
        if (this.game.hash() !== msg.hash) { this.terminalError("opponent's client cheated (hash mismatch)"); return; }
        this.moves.push(msg.uci);
        this.persist();
        this.serverListeners.forEach((f) => f(msg));
        return;
      }
      case 'game_over':
        this.result = { result: msg.result, reason: msg.reason };
        this.persist();
        this.serverListeners.forEach((f) => f(msg));
        return;
      default:
        this.serverListeners.forEach((f) => f(msg));
        return;
    }
  }

  private handleResync(moves: string[], result: { result: string; reason: string } | null): void {
    const mine = this.moves;
    const extends_ = moves.length >= mine.length && mine.every((m, i) => moves[i] === m);
    if (!extends_) { this.terminalError('resync rejected: host history diverges from ours'); return; }
    if (!this.game && this.hostSetup && this.pendingSetup) {
      const rs = this.rulesetFor(this.ruleset);
      if (!rs) { this.terminalError('unknown ruleset'); return; }
      this.game = createGame(rs, this.hostSetup, this.pendingSetup);
    }
    if (!this.game) return;
    for (let i = mine.length; i < moves.length; i++) {
      const move = this.game.parseUci(moves[i]!);
      if (!move) { this.terminalError('resync rejected: illegal move in host history'); return; }
      this.game.make(move);
    }
    this.moves = [...moves];
    if (result) this.result = result as { result: WireResult; reason: WireReason };
    this.persist();
    this.serverListeners.forEach((f) => f({ t: 'move_made', uci: moves[moves.length - 1] ?? '', ply: this.game!.ply(), hash: this.game!.hash() }));
  }

  private persist(): void {
    if (!this.storage) return;
    const state: P2PStoredState = {
      role: 'guest', color: 'b',
      mySetup: this.pendingSetup ?? undefined,
      salt: this.mySalt ?? undefined,
      opponentCommit: this.hostCommitHash ?? undefined,
      hostSetup: this.hostSetup ?? undefined,
      moves: [...this.moves],
      result: this.result,
    };
    try { this.storage.setItem(storageKey(this.code), JSON.stringify(state)); } catch { /* ignore */ }
  }

  close(): void { this.link.close(); }
}
