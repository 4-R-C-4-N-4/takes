// Plain-TS controller driving the online game lifecycle for a room. The server is the sole
// authority: moves are only ever applied to the local engine instance when the server confirms
// them via `move_made` (including our own), never optimistically.
import { getRuleset } from '@takes/library';
import { createGame, type Game, type Move } from '@takes/engine';
import type { BotLevel, ServerMsg, WireIssue, WireReason, WireResult } from '@takes/protocol';
import type { Color } from '@takes/library';
import { TakesClient, loadToken, type ClientOpts } from './client.js';
import type { OnlineTransport } from './transport.js';

export type Phase = 'connecting' | 'setup-wait' | 'playing' | 'over';

export interface OnlineSnapshot {
  phase: Phase;
  code: string | null;
  color: Color | null;
  ruleset: string;
  bot: BotLevel | null;
  mySetup: string | null;
  opponentReady: boolean;
  setupIssues: WireIssue[] | null;
  game: Game | null;
  lastMove: Move | null;
  result: { result: WireResult; reason: WireReason } | null;
  drawOfferBy: Color | null;
  opponentConnected: boolean;
  forfeitInMs: number | null;
  error: string | null;
}

export interface CreateOpts { ruleset: string; color?: Color; bot?: BotLevel }

/** What to do when (re)entering the game route for a given code. */
export type Intent =
  | { kind: 'create'; opts: CreateOpts; setup: string }
  | { kind: 'join'; code: string; setup: string }
  | { kind: 'resume'; code: string }
  /** P2P (static build): the transport is already live (HostSession/GuestSession); no
   *  create_room/join_room round trip — just record code/color/ruleset and submit the setup
   *  (or, on resume, start from a pre-built snapshot instead of resubmitting it). */
  | { kind: 'p2p'; code: string; color: Color; ruleset: string; setup: string; resumeSnapshot?: Partial<OnlineSnapshot> };

export class OnlineGameController {
  private client: OnlineTransport & { connect(code?: string): void };
  private snap: OnlineSnapshot;
  private readonly listeners = new Set<(s: OnlineSnapshot) => void>();
  private pendingSetup: string | null = null;

  /** Accepts either server-connection options (wraps a TakesClient) or an already-built
   *  transport (P2P's HostSession/GuestSession loopback, wrapped with a no-op connect()). */
  constructor(clientOrTransport: ClientOpts | (OnlineTransport & { connect(code?: string): void })) {
    this.client = 'url' in clientOrTransport ? new TakesClient(clientOrTransport) : clientOrTransport;
    this.snap = {
      phase: 'connecting', code: null, color: null, ruleset: '', bot: null,
      mySetup: null, opponentReady: false, setupIssues: null, game: null, lastMove: null,
      result: null, drawOfferBy: null, opponentConnected: true, forfeitInMs: null, error: null,
    };
    this.client.onMessage((m) => this.handle(m));
  }

  subscribe(fn: (s: OnlineSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<OnlineSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((f) => f(this.snap));
  }

  /** Start the controller per an intent resolved by the route (create/join/resume). */
  start(intent: Intent): void {
    if (intent.kind === 'resume') {
      this.client.connect(intent.code);
      return;
    }
    if (intent.kind === 'p2p') {
      this.client.connect();
      if (intent.resumeSnapshot) {
        this.emit({ code: intent.code, color: intent.color, ruleset: intent.ruleset, ...intent.resumeSnapshot });
      } else {
        this.pendingSetup = intent.setup;
        this.emit({ code: intent.code, color: intent.color, ruleset: intent.ruleset, phase: 'setup-wait' });
        this.client.send({ t: 'submit_setup', setup: intent.setup });
      }
      return;
    }
    this.pendingSetup = intent.setup;
    this.client.connect();
    const onOpen = this.client.onStatus((status) => {
      if (status !== 'open') return;
      onOpen();
      if (intent.kind === 'create') this.client.send({ t: 'create_room', ruleset: intent.opts.ruleset, color: intent.opts.color, bot: intent.opts.bot });
      else this.client.send({ t: 'join_room', code: intent.code });
    });
  }

  submitSetup(setup: string): void {
    this.pendingSetup = setup;
    this.client.send({ t: 'submit_setup', setup });
  }

  move(uci: string): void {
    if (!this.snap.game) return;
    this.client.send({ t: 'move', uci, ply: this.snap.game.ply() });
  }

  resign(): void { this.client.send({ t: 'resign', ply: this.snap.game?.ply() ?? 0 }); }
  offerDraw(): void { this.client.send({ t: 'offer_draw', ply: this.snap.game?.ply() ?? 0 }); }
  acceptDraw(): void { this.client.send({ t: 'accept_draw', ply: this.snap.game?.ply() ?? 0 }); }

  close(): void { this.client.close(); }

  private handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'room_created':
        this.emit({ code: msg.code, color: msg.color, ruleset: msg.ruleset, bot: msg.bot ?? null, phase: 'setup-wait' });
        if (this.pendingSetup) this.client.send({ t: 'submit_setup', setup: this.pendingSetup });
        return;
      case 'joined':
        this.emit({ code: msg.code, color: msg.color, ruleset: msg.ruleset, phase: 'setup-wait' });
        if (this.pendingSetup) this.client.send({ t: 'submit_setup', setup: this.pendingSetup });
        return;
      case 'setup_accepted':
        this.emit({ mySetup: this.pendingSetup, setupIssues: null });
        return;
      case 'setup_rejected':
        this.emit({ setupIssues: msg.issues });
        return;
      case 'opponent_ready':
        this.emit({ opponentReady: true });
        return;
      case 'game_start': {
        const rs = getRuleset(this.snap.ruleset);
        if (!rs) return;
        const game = createGame(rs, msg.setups.w, msg.setups.b);
        this.emit({ phase: 'playing', game, lastMove: null });
        return;
      }
      case 'move_made': {
        const game = this.snap.game;
        if (!game) return;
        const move = game.parseUci(msg.uci);
        if (!move) return; // should not happen; server is authoritative and validated
        game.make(move);
        const status = game.status();
        this.emit({ game, lastMove: move });
        if (status.result !== '*') this.emit({ phase: 'over', result: { result: status.result, reason: status.reason ?? 'move-cap' } });
        return;
      }
      case 'move_rejected':
        this.emit({ error: `move rejected: ${msg.reason}` });
        return;
      case 'draw_offered':
        this.emit({ drawOfferBy: msg.by });
        return;
      case 'game_over':
        this.emit({ phase: 'over', result: { result: msg.result, reason: msg.reason } });
        return;
      case 'opponent_connection':
        this.emit({ opponentConnected: msg.connected, forfeitInMs: msg.forfeitInMs ?? null });
        return;
      case 'state': {
        const s = msg.state;
        const rs = getRuleset(s.ruleset);
        let game: Game | null = null;
        if (rs && s.setups.w && s.setups.b) {
          game = createGame(rs, s.setups.w, s.setups.b);
          for (const uci of s.moves) {
            const mv = game.parseUci(uci);
            if (!mv) break;
            game.make(mv);
          }
        }
        this.emit({
          code: s.code, color: s.you, ruleset: s.ruleset,
          phase: s.phase === 'setup' ? 'setup-wait' : s.phase === 'over' ? 'over' : 'playing',
          mySetup: s.setups[s.you] ?? null, opponentReady: !!s.setups[s.you === 'w' ? 'b' : 'w'],
          game, drawOfferBy: s.drawOfferBy ?? null,
          result: s.result ?? null,
        });
        return;
      }
      case 'error':
        this.emit({ error: msg.message });
        return;
      default:
        return;
    }
  }
}

export { loadToken };
