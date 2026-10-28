import * as engine from '@takes/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostSession, createGuestSession, resumeP2PSession, buildResumeSnapshot } from '../p2p-session.js';
import { joinTrysteroLink, type PeerEvent, type PeerLink } from '../peer-link.js';

vi.mock('../peer-link.js', () => ({ joinTrysteroLink: vi.fn() }));
const setup = '2026.1:RNBQKBNR/PPPPPPPP/8';
const opts = { code: 'TESTCODE', ruleset: '2026.1', setup };
function link() {
  const peers = new Set<(event: PeerEvent) => void>();
  const frames = new Set<(frame: unknown) => void>();
  const result: PeerLink = {
    send: vi.fn(), close: vi.fn(),
    onPeer: cb => { peers.add(cb); return () => { peers.delete(cb); }; },
    onFrame: cb => { frames.add(cb); return () => { frames.delete(cb); }; },
  };
  vi.mocked(joinTrysteroLink).mockResolvedValue(result);
  return { result, peers, frames };
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('P2P session cleanup', () => {
  for (const create of [createHostSession, createGuestSession]) {
    it(`cleans status timers and every subscription for ${create.name}`, async () => {
      vi.useFakeTimers();
      const { result, peers, frames } = link();
      const handle = await create(opts);
      expect(handle.getStatus()).toBe('waiting');
      expect(vi.getTimerCount()).toBe(1);
      peers.forEach(cb => cb('join'));
      expect(handle.getStatus()).toBe('connected');
      handle.close(); handle.close();
      expect(result.close).toHaveBeenCalledTimes(1);
      expect(peers.size).toBe(0);
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('closes a late link when stored state disappears during asynchronous initialization', async () => {
    vi.useFakeTimers();
    const { result } = link();
    let raw: string | null = JSON.stringify({ role: 'host', moves: [] });
    const storage = { getItem: () => raw, setItem: vi.fn() };
    const pending = resumeP2PSession({ ...opts, storage });
    raw = null;
    expect(await pending).toBeNull();
    expect(result.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans the link and tracking timer if stored game reconstruction throws', async () => {
    vi.useFakeTimers();
    const { result } = link();
    const storage = { getItem: () => JSON.stringify({ role: 'guest', mySetup: setup, hostSetup: setup, salt: 'a'.repeat(32), moves: [] }), setItem: vi.fn() };
    const create = vi.spyOn(engine, 'createGame').mockImplementationOnce(() => { throw new Error('reconstruction failed'); });
    try {
      await expect(resumeP2PSession({ ...opts, storage })).rejects.toThrow('reconstruction failed');
    } finally { create.mockRestore(); }
    expect(result.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects corrupt storage without opening a relay', async () => {
    for (const raw of ['null', '{}', '{', JSON.stringify({ role: 'alien', moves: [] }), JSON.stringify({ role: 'host', moves: [123] })]) {
      const storage = { getItem: () => raw, setItem: vi.fn() };
      expect(buildResumeSnapshot(opts.code, opts.ruleset, storage)).toBeNull();
      expect(await resumeP2PSession({ ...opts, storage })).toBeNull();
    }
    expect(joinTrysteroLink).not.toHaveBeenCalled();
  });
});
