import { describe, it, expect, afterEach } from 'vitest';
import { startTestServer, TestClient, sleep } from './test-helpers.js';

const VANILLA = '2026.1:RNBQKBNR/PPPPPPPP/8';

let servers: Array<{ close: () => Promise<void> }> = [];
async function server(opts: Partial<Parameters<typeof startTestServer>[0]> = {}) {
  const s = await startTestServer(opts);
  servers.push(s);
  return s;
}
afterEach(async () => {
  for (const s of servers) await s.close();
  servers = [];
});

async function setupGame(port: number) {
  const host = new TestClient(port);
  const guest = new TestClient(port);
  await host.ready(); await guest.ready();
  host.send({ t: 'create_room', ruleset: '2026.1' });
  const created = await host.waitFor((m) => m.t === 'room_created') as { code: string; token: string; color: 'w' | 'b' };
  guest.send({ t: 'join_room', code: created.code });
  const joined = await guest.waitFor((m) => m.t === 'joined') as { token: string; color: 'w' | 'b' };
  const w = created.color === 'w' ? host : guest;
  const b = created.color === 'w' ? guest : host;
  w.send({ t: 'submit_setup', setup: VANILLA });
  b.send({ t: 'submit_setup', setup: VANILLA });
  await w.waitFor((m) => m.t === 'game_start');
  await b.waitFor((m) => m.t === 'game_start');
  return { host, guest, w, b, code: created.code, hostToken: created.token, guestToken: joined.token, hostColor: created.color };
}

describe('room lifecycle', () => {
  it('hides setups until both players are ready', async () => {
    const s = await server();
    const host = new TestClient(s.port);
    const guest = new TestClient(s.port);
    await host.ready(); await guest.ready();
    host.send({ t: 'create_room', ruleset: '2026.1', color: 'w' });
    const created = await host.waitFor((m) => m.t === 'room_created') as { code: string };
    guest.send({ t: 'join_room', code: created.code });
    await guest.waitFor((m) => m.t === 'joined');

    host.send({ t: 'submit_setup', setup: VANILLA });
    await host.waitFor((m) => m.t === 'setup_accepted');
    await guest.waitFor((m) => m.t === 'opponent_ready');

    // Guest has not submitted yet: host must receive nothing revealing the opponent's setup.
    const leaked = host.received.find((m) => m.t === 'game_start');
    expect(leaked).toBeUndefined();

    guest.send({ t: 'submit_setup', setup: VANILLA });
    const start1 = await host.waitFor((m) => m.t === 'game_start') as { setups: { w: string; b: string } };
    const start2 = await guest.waitFor((m) => m.t === 'game_start');
    expect(start1.setups.w).toBe(VANILLA);
    expect(start1.setups.b).toBe(VANILLA);
    expect(start2).toBeTruthy();
    host.close(); guest.close();
  });

  it('plays a full game to fool\'s mate (0-1)', async () => {
    const s = await server();
    const { w, b } = await setupGame(s.port);
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    let ply = 0;
    for (const uci of moves) {
      const mover = ply % 2 === 0 ? w : b;
      mover.send({ t: 'move', uci, ply });
      await w.waitFor((m) => m.t === 'move_made' && m.ply === ply + 1);
      await b.waitFor((m) => m.t === 'move_made' && m.ply === ply + 1);
      ply++;
    }
    const over = await w.waitFor((m) => m.t === 'game_over') as { result: string; reason: string };
    expect(over.result).toBe('0-1');
    expect(over.reason).toBe('checkmate');
    w.close(); b.close();
  });

  it('rejects illegal, out-of-turn and stale-ply moves', async () => {
    const s = await server();
    const { w, b } = await setupGame(s.port);
    // illegal move (knight can't go there)
    w.send({ t: 'move', uci: 'b1b3', ply: 0 });
    const rej1 = await w.waitFor((m) => m.t === 'move_rejected');
    expect(rej1).toBeTruthy();
    // out of turn: black tries to move first
    b.send({ t: 'move', uci: 'e7e5', ply: 0 });
    const rej2 = await b.waitFor((m) => m.t === 'move_rejected');
    expect((rej2 as { reason: string }).reason).toBe('not_your_turn');
    // legal moves to advance ply, then white resends a stale ply number
    w.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await w.waitFor((m) => m.t === 'move_made' && m.ply === 1);
    b.send({ t: 'move', uci: 'e7e5', ply: 1 });
    await b.waitFor((m) => m.t === 'move_made' && m.ply === 2);
    w.send({ t: 'move', uci: 'd2d4', ply: 0 });
    const rej3 = await w.waitFor((m) => m.t === 'move_rejected' && (m as { reason: string }).reason === 'stale_ply');
    expect((rej3 as { reason: string }).reason).toBe('stale_ply');
    w.close(); b.close();
  });

  it('reconnects with a token and restores full state', async () => {
    const s = await server();
    const { w, b, hostToken, hostColor } = await setupGame(s.port);
    w.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await w.waitFor((m) => m.t === 'move_made');
    await b.waitFor((m) => m.t === 'move_made');

    const resumer = new TestClient(s.port);
    await resumer.ready();
    resumer.send({ t: 'resume', token: hostToken });
    const state = await resumer.waitFor((m) => m.t === 'state') as { state: { phase: string; moves: string[]; you: string; setups: Record<string, string> } };
    expect(state.state.phase).toBe('playing');
    expect(state.state.moves).toEqual(['e2e4']);
    expect(state.state.you).toBe(hostColor);
    expect(state.state.setups.w).toBe(VANILLA);
    expect(state.state.setups.b).toBe(VANILLA);
    w.close(); b.close(); resumer.close();
  });

  it('rejects a bad resume token', async () => {
    const s = await server();
    const client = new TestClient(s.port);
    await client.ready();
    client.send({ t: 'resume', token: 'totally-not-a-real-token' });
    const err = await client.waitFor((m) => m.t === 'error');
    expect((err as { code: string }).code).toBe('bad_token');
    client.close();
  });

  it('forfeits on disconnect past the timeout', async () => {
    const s = await server({ forfeitMs: 300 });
    const { w, b } = await setupGame(s.port);
    w.close();
    const over = await b.waitFor((m) => m.t === 'game_over', 5000) as { reason: string };
    expect(over.reason).toBe('abandon');
    b.close();
  });

  it('restarts and reloads an in-progress room from SQLite', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'takes-server-test-'));
    const dbPath = join(dir, 'takes.db');

    const s1 = await server({ dbPath, forfeitMs: 60_000 });
    const { w, b, hostToken, hostColor, code } = await setupGame(s1.port);
    w.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await w.waitFor((m) => m.t === 'move_made');
    await b.waitFor((m) => m.t === 'move_made');
    w.close(); b.close();
    await s1.close();

    const s2 = await server({ dbPath, forfeitMs: 60_000 });
    const room = s2.rooms.get(code);
    expect(room).toBeTruthy();
    expect(room!.phase).toBe('playing');
    expect(room!.moves).toEqual(['e2e4']);

    const resumer = new TestClient(s2.port);
    await resumer.ready();
    resumer.send({ t: 'resume', token: hostToken });
    const state = await resumer.waitFor((m) => m.t === 'state') as { state: { moves: string[]; you: string } };
    expect(state.state.moves).toEqual(['e2e4']);
    expect(state.state.you).toBe(hostColor);
    resumer.close();
  });

  it('handles malformed messages without crashing', async () => {
    const s = await server();
    const client = new TestClient(s.port);
    await client.ready();
    client.sendRaw('not json');
    const err1 = await client.waitFor((m) => m.t === 'error');
    expect((err1 as { code: string }).code).toBe('bad_message');
    client.sendRaw(JSON.stringify({ t: 'move', uci: 'nope', ply: -1 }));
    const err2 = await client.waitFor((m) => m.t === 'error' && client.received.filter((x) => x.t === 'error').length >= 2);
    expect(err2).toBeTruthy();
    // server should still answer pings afterwards
    client.send({ t: 'ping' });
    await client.waitFor((m) => m.t === 'pong');
    client.close();
  });
});

describe('bot room (Fairy-Stockfish, D12)', () => {
  it('plays a bot game with every bot move engine-validated', async () => {
    const { FsfBot } = await import('../bot/fsf-bot.js');
    if (!FsfBot.available()) {
      console.warn('Fairy-Stockfish binary not found; skipping bot test');
      return;
    }
    const s = await server();
    const client = new TestClient(s.port);
    await client.ready();
    client.send({ t: 'create_room', ruleset: '2026.1#bot:easy', color: 'w' });
    const created = await client.waitFor((m) => m.t === 'room_created') as { code: string };
    client.send({ t: 'submit_setup', setup: VANILLA });
    await client.waitFor((m) => m.t === 'game_start');

    const maxPlies = 10;
    for (let i = 0; i < maxPlies; i++) {
      const room = s.rooms.get(created.code)!;
      if (room.phase === 'over') break;
      if (room.game!.sideToMove() !== 'w') {
        // wait for the bot to answer
        await sleep(50);
        continue;
      }
      const legal = room.game!.legalMoves();
      if (legal.length === 0) break;
      const uci = room.game!.moveToUci(legal[0]!);
      const ply = room.game!.ply();
      client.send({ t: 'move', uci, ply });
      try {
        await client.waitFor((m) => m.t === 'move_made' && m.ply === ply + 1, 2000);
      } catch { break; }
      await sleep(300); // let the bot reply
    }
    expect(s.rooms.rejectedBotMoves).toEqual([]);
    client.close();
  }, 30_000);

  it('fails clearly if Fairy-Stockfish is not found', async () => {
    const { FsfBot } = await import('../bot/fsf-bot.js');
    const realPath = process.env.FSF_PATH;
    process.env.FSF_PATH = '/nonexistent/stockfish-binary';
    try {
      const s = await server();
      const client = new TestClient(s.port);
      await client.ready();
      client.send({ t: 'create_room', ruleset: '2026.1#bot:easy' });
      const resp = await client.waitFor((m) => m.t === 'room_created' || m.t === 'error');
      expect(resp.t).toBe('error');
      client.close();
    } finally {
      if (realPath === undefined) delete process.env.FSF_PATH; else process.env.FSF_PATH = realPath;
    }
  });
});
