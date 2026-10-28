/**
 * GuestSession: an OnlineTransport for the guest UI backed entirely by a PeerLink to the host.
 * The guest never trusts the host's RoomCore blindly: it keeps its own @takes/engine Game,
 * replays every move_made locally (checking legality + hash), and verifies the host's setup
 * against the host's earlier commit before ever starting its local game. Any mismatch — bad
 * commit, illegal move, wrong hash, unknown ruleset — becomes a terminal 'error' ServerMsg;
 * the guest never applies a move optimistically or otherwise without this verification.
 */
import { validateProfile, hasErrors } from '@takes/validator';
import { createGame, type Game } from '@takes/engine';
import type { Color, Ruleset } from '@takes/library';
import type { ClientMsg, ServerMsg, WireReason, WireResult } from '@takes/protocol';
import { commitSetup, randomSaltHex, verifyCommit } from './commit-reveal.js';
import { parsePeerFrame, PEER_PROTOCOL_VERSION, type PeerFrame } from './p2p-protocol.js';
import type { PeerLink } from './peer-link.js';
import { readStoredP2PState, storageKey, type P2PStorageLike, type P2PStoredState } from './p2p-host.js';
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
    hostCommitHash: string | null; hostSetup: string | null; moves: string[];
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
  private terminalMessage: string | null = null;
  private closed = false;
  private readonly unsubFrame: () => void;
  private readonly unsubPeer: () => void;
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
      this.revealed = !!opts.resume.hostSetup;
      this.hostCommitHash = opts.resume.hostCommitHash;
      this.hostSetup = opts.resume.hostSetup;
      this.moves = [...opts.resume.moves];
      this.result = opts.resume.result ?? null;
      const rs = this.rulesetFor(this.ruleset);
      if (rs && opts.resume.hostSetup && this.validArmies(rs, opts.resume.hostSetup, opts.resume.mySetup)) {
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
      onMessage: (cb) => { this.serverListeners.add(cb); if (this.terminalMessage) cb({ t: 'error', code: 'bad_message', message: this.terminalMessage }); return () => this.serverListeners.delete(cb); },
      onStatus: (cb) => { this.statusListeners.add(cb); cb('open'); return () => this.statusListeners.delete(cb); },
      close: () => {},
    };
    this.unsubFrame = this.link.onFrame((raw) => { this.frameQueue = this.frameQueue.then(() => this.onFrame(raw)).catch(() => this.terminalError('Could not process peer data.')); });
    this.unsubPeer = this.link.onPeer((event) => {
      if (event !== 'join' || this.closed || this.terminal) return;
      this.link.send({ v: 1, t: 'hello', app: 'takes', protocol: PEER_PROTOCOL_VERSION, ruleset: this.ruleset });
      if (this.pendingSetup && this.mySalt) {
        void commitSetup(this.pendingSetup, this.mySalt).then((hash) => {
          if (this.closed || this.terminal) return;
          this.link.send({ v: 1, t: 'commit', hash });
          this.myCommitSent = true;
          if (!this.game) this.revealed = false;
          return this.revealIfReady();
        }).catch(() => this.terminalError('Could not commit army.'));
      }
    });
  }

  /** Guest reconstruction helper: host/guest setups are two separate strings, both needed to rebuild the engine. */

  /** Rebuilds a GuestSession from localStorage after a page reload mid-game. */
  static fromStorage(opts: Omit<GuestSessionOpts, 'resume'> & { storage: P2PStorageLike }): GuestSession | null {
    const s = readStoredP2PState(opts.storage, opts.code);
    if (!s || s.role !== 'guest' || !s.mySetup || !s.salt) return null;
    return new GuestSession({
      ...opts,
      resume: {
        mySetup: s.mySetup, mySalt: s.salt, myCommit: '', hostCommitHash: s.opponentCommit ?? null,
        hostSetup: s.hostSetup ?? null, moves: s.moves, result: s.result ?? null,
      },
    });
  }

  private terminalError(message: string): void {
    if (this.closed || this.terminal) return;
    this.terminal = true;
    this.terminalMessage = message;
    this.serverListeners.forEach((f) => f({ t: 'error', code: 'bad_message', message }));
  }

  private handleGuestClientMsg(msg: ClientMsg): void {
    if (this.closed || this.terminal) return;
    if (msg.t === 'submit_setup') { void this.guestSubmitSetup(msg.setup).catch(() => this.terminalError('Could not commit army.')); return; }
    this.link.send({ v: 1, t: 'client', msg });
  }

  private async guestSubmitSetup(setup: string): Promise<void> {
    if (this.pendingSetup) return;
    const rs = this.rulesetFor(this.ruleset);
    if (!rs) { this.terminalError('Unknown ruleset.'); return; }
    const issues = validateProfile(setup, rs, { color: 'b' });
    if (hasErrors(issues)) { this.serverListeners.forEach(f => f({ t: 'setup_rejected', issues })); return; }
    this.pendingSetup = setup;
    this.mySalt = randomSaltHex();
    const hash = await commitSetup(setup, this.mySalt);
    if (this.closed) return;
    this.link.send({ v: 1, t: 'commit', hash });
    this.myCommitSent = true;
    this.persist();
    await this.revealIfReady();
  }

  private async revealIfReady(): Promise<void> {
    if (this.closed || this.terminal || this.revealed || !this.myCommitSent || !this.pendingSetup || !this.mySalt || !this.hostCommitHash) return;
    this.revealed = true;
    this.link.send({ v: 1, t: 'guest-setup', setup: this.pendingSetup, salt: this.mySalt });
  }

  private async onFrame(raw: unknown): Promise<void> {
    if (this.closed || this.terminal) return;
    const f: PeerFrame | null = parsePeerFrame(raw);
    if (!f) return; // malformed frame from host: ignored
    switch (f.t) {
      case 'hello':
        if (f.app !== 'takes' || f.protocol !== PEER_PROTOCOL_VERSION || f.ruleset !== this.ruleset) this.terminalError('protocol version mismatch');
        return;
      case 'commit':
        if (this.hostCommitHash && this.hostCommitHash !== f.hash) { this.terminalError('Host changed its setup commitment.'); return; }
        this.hostCommitHash = f.hash;
        this.persist();
        await this.revealIfReady();
        return;
      case 'host-reveal': {
        if (!this.hostCommitHash || !(await verifyCommit(f.setup, f.salt, this.hostCommitHash))) {
          this.terminalError("opponent's client cheated (setup mismatch)");
          return;
        }
        if (this.closed) return;
        const rs = this.rulesetFor(this.ruleset);
        if (!rs) { this.terminalError('unknown ruleset'); return; }
        if (hasErrors(validateProfile(f.setup, rs, { color: 'w' }))) {
          this.terminalError("opponent's client cheated (invalid army)"); return;
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
        if (this.game) { this.terminalError('Unexpected game restart.'); return; }
        if (!this.hostSetup || msg.setups.w !== this.hostSetup || msg.setups.b !== this.pendingSetup) {
          this.terminalError("opponent's client cheated (setup mismatch)");
          return;
        }
        const rs = this.rulesetFor(this.ruleset);
        if (!rs) { this.terminalError('unknown ruleset'); return; }
        if (!this.validArmies(rs, msg.setups.w, msg.setups.b)) return;
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
        if (msg.ply !== this.game.ply() + 1) { this.terminalError('Unexpected move ply.'); return; }
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
      if (!this.validArmies(rs, this.hostSetup, this.pendingSetup)) return;
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
    this.serverListeners.forEach((f) => f({ t: 'state', state: {
      code: this.code, ruleset: this.ruleset, you: 'b', phase: this.result ? 'over' : 'playing',
      setups: { w: this.hostSetup!, b: this.pendingSetup! }, ready: { w: true, b: true },
      moves: [...this.moves], ...(this.result ? { result: this.result } : {}),
    } }));
  }

  private validArmies(rs: Ruleset, white: string, black: string): boolean {
    if (hasErrors(validateProfile(white, rs, { color: 'w' })) ||
        hasErrors(validateProfile(black, rs, { color: 'b' }))) {
      this.terminalError("opponent's client cheated (invalid army)");
      return false;
    }
    return true;
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

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubFrame(); this.unsubPeer();
    this.serverListeners.clear(); this.statusListeners.clear();
    this.link.close();
  }
}
