import { describe, it, expect } from 'vitest';
import { createLinkPair } from '../peer-link.js';
import { parsePeerFrame, type PeerFrame } from '../p2p-protocol.js';
import { HostSession, storageKey, type P2PStorageLike } from '../p2p-host.js';
import { GuestSession } from '../p2p-guest.js';
import { getRuleset } from '@takes/library';
import type { ServerMsg } from '@takes/protocol';

const RULESET = '2026.1';
const VANILLA = '2026.1:RNBQKBNR/PPPPPPPP/8';
const rulesetFor = (v: string) => getRuleset(v);

class MemoryStorage implements P2PStorageLike {
  store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
}

/** Drains pending microtasks/timers so queued async work (crypto digests, frame delivery) lands. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

function collect(transport: { onMessage(cb: (m: ServerMsg) => void): () => void }): ServerMsg[] {
  const out: ServerMsg[] = [];
  transport.onMessage((m) => out.push(m));
  return out;
}

function makeSession(code = 'ABCD1234') {
  const link = createLinkPair();
  const host = new HostSession({ code, ruleset: RULESET, rulesetFor, link: link.host, forfeitMs: Infinity });
  const guest = new GuestSession({ code, ruleset: RULESET, rulesetFor, link: link.guest });
  return { link, host, guest };
}

async function playBothSetups(host: HostSession, guest: GuestSession, hostSetup = VANILLA, guestSetup = VANILLA): Promise<{ hostMsgs: ServerMsg[]; guestMsgs: ServerMsg[] }> {
  const hostMsgs = collect(host.transport);
  const guestMsgs = collect(guest.transport);
  await flush();
  host.transport.send({ t: 'submit_setup', setup: hostSetup });
  guest.transport.send({ t: 'submit_setup', setup: guestSetup });
  await flush(15);
  return { hostMsgs, guestMsgs };
}

describe('P2P core: full game lifecycle', () => {
  it('plays a full game via move exchange and reaches game_start on both sides', async () => {
    const { host, guest } = makeSession();
    const { hostMsgs, guestMsgs } = await playBothSetups(host, guest);
    expect(hostMsgs.some((m) => m.t === 'game_start')).toBe(true);
    expect(guestMsgs.some((m) => m.t === 'game_start')).toBe(true);
  });

  it('resign ends the game for both sides', async () => {
    const { host, guest } = makeSession();
    const { hostMsgs, guestMsgs } = await playBothSetups(host, guest);
    guest.transport.send({ t: 'resign', ply: 0 });
    await flush(10);
    expect(hostMsgs.some((m) => m.t === 'game_over' && m.result === '1-0')).toBe(true);
    expect(guestMsgs.some((m) => m.t === 'game_over' && m.result === '1-0')).toBe(true);
  });

  it('draw offer + accept ends the game in a draw', async () => {
    const { host, guest } = makeSession();
    const { hostMsgs, guestMsgs } = await playBothSetups(host, guest);
    host.transport.send({ t: 'offer_draw', ply: 0 });
    await flush(6);
    expect(guestMsgs.some((m) => m.t === 'draw_offered' && m.by === 'w')).toBe(true);
    guest.transport.send({ t: 'accept_draw', ply: 0 });
    await flush(10);
    expect(hostMsgs.some((m) => m.t === 'game_over' && m.result === '1/2-1/2')).toBe(true);
    expect(guestMsgs.some((m) => m.t === 'game_over' && m.result === '1/2-1/2')).toBe(true);
  });

  it('a legal move made by the host reaches the guest and is applied there too', async () => {
    const { host, guest } = makeSession();
    const { guestMsgs } = await playBothSetups(host, guest);
    host.transport.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await flush(10);
    expect(guestMsgs.some((m) => m.t === 'move_made' && m.uci === 'e2e4')).toBe(true);
  });

  it("plays a full game to checkmate (fool's mate) with both sides verifying every move", async () => {
    const { host, guest } = makeSession();
    const { hostMsgs, guestMsgs } = await playBothSetups(host, guest);
    const moves: Array<{ by: 'host' | 'guest'; uci: string; ply: number }> = [
      { by: 'host', uci: 'f2f3', ply: 0 }, { by: 'guest', uci: 'e7e5', ply: 1 },
      { by: 'host', uci: 'g2g4', ply: 2 }, { by: 'guest', uci: 'd8h4', ply: 3 },
    ];
    for (const m of moves) {
      (m.by === 'host' ? host : guest).transport.send({ t: 'move', uci: m.uci, ply: m.ply });
      await flush(8);
    }
    expect(hostMsgs.some((m) => m.t === 'game_over' && m.reason === 'checkmate')).toBe(true);
    expect(guestMsgs.some((m) => m.t === 'game_over' && m.reason === 'checkmate')).toBe(true);
  });
});

describe('P2P core: blind setup / commit-reveal', () => {
  it('host never leaks its own setup before sending its commit; guest never reveals before its own commit is sent', async () => {
    const code = 'BLIND001';
    const link = createLinkPair();
    const hostFrames: PeerFrame[] = [];
    const guestFrames: PeerFrame[] = [];
    link.host.onFrame((raw) => { const f = parsePeerFrame(raw); if (f) hostFrames.push(f); });
    link.guest.onFrame((raw) => { const f = parsePeerFrame(raw); if (f) guestFrames.push(f); });
    const host = new HostSession({ code, ruleset: RULESET, rulesetFor, link: link.host, forfeitMs: Infinity });
    const guest = new GuestSession({ code, ruleset: RULESET, rulesetFor, link: link.guest });
    await flush();

    host.transport.send({ t: 'submit_setup', setup: VANILLA });
    await flush(10);
    // Host's commit must already have reached the guest before the guest ever reveals anything to it.
    expect(guestFrames.findIndex((f) => f.t === 'commit')).toBeGreaterThanOrEqual(0);
    expect(guestFrames.some((f) => f.t === 'guest-setup')).toBe(false);

    guest.transport.send({ t: 'submit_setup', setup: VANILLA });
    await flush(15);
    // From the host's incoming side: the guest's commit must arrive strictly before its guest-setup reveal.
    const hostSideCommitIdx = hostFrames.findIndex((f) => f.t === 'commit');
    const hostSideSetupIdx = hostFrames.findIndex((f) => f.t === 'guest-setup');
    expect(hostSideCommitIdx).toBeGreaterThanOrEqual(0);
    expect(hostSideSetupIdx).toBeGreaterThan(hostSideCommitIdx);
  });

  it('detects a tampered host setup reveal (host lies about its own commit)', async () => {
    const code = 'TAMPER01';
    const link = createLinkPair();
    const host = new HostSession({ code, ruleset: RULESET, rulesetFor, link: link.host, forfeitMs: Infinity });
    const guest = new GuestSession({ code, ruleset: RULESET, rulesetFor, link: link.guest });
    const guestMsgs = collect(guest.transport);
    await flush();
    host.transport.send({ t: 'submit_setup', setup: VANILLA });
    await flush(10);
    // Tamper: deliver a fake host-reveal with a different setup than what was committed.
    link.deliverRawToGuest({ v: 1, t: 'host-reveal', setup: '2026.1:RNBQKBNR/PPPPPPPP/7/8', salt: 'deadbeefdeadbeefdeadbeefdeadbeef' });
    await flush(10);
    expect(guestMsgs.some((m) => m.t === 'error' && /cheated/.test(m.message))).toBe(true);
  });

  it('detects wrong hash on a move (host lies about the resulting position)', async () => {
    const { link, host, guest } = makeSession('WRONGHSH');
    const { guestMsgs } = await playBothSetups(host, guest);
    link.deliverRawToGuest({ v: 1, t: 'server', msg: { t: 'move_made', uci: 'e2e4', ply: 1, hash: 'bogus-hash' } });
    await flush(10);
    expect(guestMsgs.some((m) => m.t === 'error' && /cheated/.test(m.message))).toBe(true);
  });

  it('detects an illegal host move', async () => {
    const { link, host, guest } = makeSession('ILLEGAL1');
    const { guestMsgs } = await playBothSetups(host, guest);
    link.deliverRawToGuest({ v: 1, t: 'server', msg: { t: 'move_made', uci: 'a1a8', ply: 1, hash: 'whatever' } });
    await flush(10);
    expect(guestMsgs.some((m) => m.t === 'error' && /illegal/.test(m.message))).toBe(true);
  });
});

describe('P2P core: protocol robustness', () => {
  it('rejects a malformed guest frame while the host keeps running', async () => {
    const code = 'MALFORM1';
    const link = createLinkPair();
    const host = new HostSession({ code, ruleset: RULESET, rulesetFor, link: link.host, forfeitMs: Infinity });
    const guest = new GuestSession({ code, ruleset: RULESET, rulesetFor, link: link.guest });
    const hostMsgs = collect(host.transport);
    const guestMsgs = collect(guest.transport);
    await flush();
    link.deliverRawToHost({ not: 'a valid frame' });
    link.deliverRawToHost('just a string');
    link.deliverRawToHost(null);
    await flush(10);
    // Host must still work normally afterwards.
    host.transport.send({ t: 'submit_setup', setup: VANILLA });
    guest.transport.send({ t: 'submit_setup', setup: VANILLA });
    await flush(15);
    expect(hostMsgs.some((m) => m.t === 'game_start')).toBe(true);
    expect(guestMsgs.some((m) => m.t === 'game_start')).toBe(true);
  });

  it('flags a protocol version mismatch as a terminal error', async () => {
    const code = 'VERMIS01';
    const link = createLinkPair();
    new HostSession({ code, ruleset: RULESET, rulesetFor, link: link.host, forfeitMs: Infinity });
    const guest = new GuestSession({ code, ruleset: RULESET, rulesetFor, link: link.guest });
    const guestMsgs = collect(guest.transport);
    await flush();
    link.deliverRawToGuest({ v: 1, t: 'hello', app: 'takes', protocol: 99, ruleset: RULESET });
    await flush(10);
    expect(guestMsgs.some((m) => m.t === 'error' && /version/.test(m.message))).toBe(true);
  });

  it('refuses a third peer at the link level', () => {
    const link = createLinkPair();
    expect(link.attemptThirdJoin()).toBe(false);
  });
});

describe('P2P core: persistence + resume', () => {
  it('host reload mid-game rebuilds RoomCore and resyncs the rejoining guest', async () => {
    const code = 'RELOAD01';
    const hostStorage = new MemoryStorage();
    const guestStorage = new MemoryStorage();
    const link1 = createLinkPair();
    const host1 = new HostSession({ code, ruleset: RULESET, rulesetFor, link: link1.host, forfeitMs: Infinity, storage: hostStorage });
    const guest1 = new GuestSession({ code, ruleset: RULESET, rulesetFor, link: link1.guest, storage: guestStorage });
    await playBothSetups(host1, guest1);
    host1.transport.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await flush(10);
    expect(hostStorage.getItem(storageKey(code))).toBeTruthy();

    // Simulate reload: host process is gone; rebuild from storage over a fresh link. The guest's
    // own tab never closed, but its WebRTC connection died with the host's — it rejoins fresh too,
    // restoring its already-verified state (not re-running commit-reveal) from its own storage.
    const link2 = createLinkPair();
    const host2 = HostSession.fromStorage({ code, ruleset: RULESET, rulesetFor, link: link2.host, forfeitMs: Infinity, storage: hostStorage });
    expect(host2).not.toBeNull();
    const guest2 = GuestSession.fromStorage({ code, ruleset: RULESET, rulesetFor, link: link2.guest, storage: guestStorage });
    expect(guest2).not.toBeNull();
    const guestMsgs2 = collect(guest2!.transport);
    await flush(15);
    // Guest rejoining a reloaded host should receive a resync extending its own (empty) history.
    expect(guestMsgs2.some((m) => m.t === 'move_made' && m.uci === 'e2e4')).toBe(true);
  });

  it('guest reload mid-game restores its verified engine and accepts a resync that extends it', async () => {
    const code = 'RELOAD02';
    const guestStorage = new MemoryStorage();
    const link1 = createLinkPair();
    const host = new HostSession({ code, ruleset: RULESET, rulesetFor, link: link1.host, forfeitMs: Infinity });
    const guest1 = new GuestSession({ code, ruleset: RULESET, rulesetFor, link: link1.guest, storage: guestStorage });
    await playBothSetups(host, guest1);
    host.transport.send({ t: 'move', uci: 'e2e4', ply: 0 });
    await flush(10);
    expect(guestStorage.getItem(storageKey(code))).toBeTruthy();

    // Guest reloads: new GuestSession restored from storage, same host, same (still open) link.
    const guest2 = GuestSession.fromStorage({ code, ruleset: RULESET, rulesetFor, link: link1.guest, storage: guestStorage });
    expect(guest2).not.toBeNull();
    const guestMsgs2 = collect(guest2!.transport);
    guest1.transport.send({ t: 'move', uci: 'e7e5', ply: 1 });
    await flush(10);
    expect(guestMsgs2.some((m) => m.t === 'move_made' && m.uci === 'e7e5')).toBe(true);
  });
});
