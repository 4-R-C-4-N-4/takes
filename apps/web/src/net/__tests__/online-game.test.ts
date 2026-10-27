import { describe, it, expect } from 'vitest';
import { OnlineGameController } from '../online-game.js';
import type { ServerMsg } from '@takes/protocol';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
}

class FakeSocket {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(msg: ServerMsg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const VANILLA = '2026.1:RNBQKBNR/PPPPPPPP/8';

function setup(): { ctrl: OnlineGameController; sockets: FakeSocket[] } {
  (globalThis as any).localStorage = new MemoryStorage();
  const sockets: FakeSocket[] = [];
  const ctrl = new OnlineGameController({
    url: 'ws://x',
    socketFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    reconnectDelayMs: 0,
  });
  return { ctrl, sockets };
}

describe('OnlineGameController', () => {
  it('creates a room, submits setup, and transitions through game_start to playing', () => {
    const { ctrl, sockets } = setup();
    const snaps: any[] = [];
    ctrl.subscribe((s) => snaps.push(s));

    ctrl.start({ kind: 'create', opts: { ruleset: '2026.1', color: 'w' }, setup: VANILLA });
    sockets[0]!.open();
    expect(JSON.parse(sockets[0]!.sent[0]!)).toMatchObject({ t: 'create_room', ruleset: '2026.1', color: 'w' });

    sockets[0]!.receive({ t: 'room_created', code: 'ABCD1234', token: 'tok', color: 'w', ruleset: '2026.1' });
    expect(JSON.parse(sockets[0]!.sent[1]!)).toMatchObject({ t: 'submit_setup', setup: VANILLA });
    expect(snaps.at(-1)!.phase).toBe('setup-wait');

    sockets[0]!.receive({ t: 'setup_accepted' });
    sockets[0]!.receive({ t: 'opponent_ready' });
    expect(snaps.at(-1)!.opponentReady).toBe(true);

    sockets[0]!.receive({ t: 'game_start', setups: { w: VANILLA, b: VANILLA }, fen: 'ignored' });
    expect(snaps.at(-1)!.phase).toBe('playing');
    expect(snaps.at(-1)!.game).toBeTruthy();
  });

  it('only applies moves on move_made from the server, including our own', () => {
    const { ctrl, sockets } = setup();
    let last: any;
    ctrl.subscribe((s) => (last = s));
    ctrl.start({ kind: 'create', opts: { ruleset: '2026.1' }, setup: VANILLA });
    sockets[0]!.open();
    sockets[0]!.receive({ t: 'room_created', code: 'ABCD1234', token: 'tok', color: 'w', ruleset: '2026.1' });
    sockets[0]!.receive({ t: 'game_start', setups: { w: VANILLA, b: VANILLA }, fen: 'x' });

    ctrl.move('e2e4');
    expect(last.game.ply()).toBe(0); // not applied until server confirms
    sockets[0]!.receive({ t: 'move_made', uci: 'e2e4', ply: 1, hash: 'h' });
    expect(last.game.ply()).toBe(1);
    expect(last.lastMove?.from).toBeDefined();
  });

  it('rebuilds state from a resume snapshot, replaying moves', () => {
    const { ctrl, sockets } = setup();
    let last: any;
    ctrl.subscribe((s) => (last = s));
    ctrl.start({ kind: 'resume', code: 'ABCD1234' });
    sockets[0]!.open();
    sockets[0]!.receive({
      t: 'state',
      state: {
        code: 'ABCD1234', ruleset: '2026.1', you: 'w', phase: 'playing',
        setups: { w: VANILLA, b: VANILLA }, ready: { w: true, b: true },
        moves: ['e2e4', 'e7e5'], fen: 'x',
      },
    });
    expect(last.phase).toBe('playing');
    expect(last.game.ply()).toBe(2);
  });

  it('surfaces setup_rejected issues', () => {
    const { ctrl, sockets } = setup();
    let last: any;
    ctrl.subscribe((s) => (last = s));
    ctrl.start({ kind: 'create', opts: { ruleset: '2026.1' }, setup: 'bogus' });
    sockets[0]!.open();
    sockets[0]!.receive({ t: 'room_created', code: 'ABCD1234', token: 'tok', color: 'w', ruleset: '2026.1' });
    sockets[0]!.receive({ t: 'setup_rejected', issues: [{ severity: 'error', code: 'bad', message: 'nope', squares: [] }] });
    expect(last.setupIssues).toHaveLength(1);
  });
});
