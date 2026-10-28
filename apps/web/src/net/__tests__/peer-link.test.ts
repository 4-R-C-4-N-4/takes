import { describe, expect, it, vi } from 'vitest';
import { joinTrysteroLink } from '../peer-link.js';

const { room, action } = vi.hoisted(() => {
  const action = { send: vi.fn().mockResolvedValue(undefined), onMessage: undefined as any };
  return { action, room: { makeAction: () => action, leave: vi.fn().mockResolvedValue(undefined), onPeerJoin: undefined as any, onPeerLeave: undefined as any } };
});
vi.mock('trystero', () => ({ joinRoom: () => room }));

describe('Trystero link adapter', () => {
  it('isolates extra peers and accepts a reload that joins before the old peer leaves', async () => {
    const link = await joinTrysteroLink('TESTCODE');
    const frames: unknown[] = [];
    const status: string[] = [];
    link.onFrame(f => frames.push(f));
    link.onPeer(s => status.push(s));
    room.onPeerJoin('old'); room.onPeerJoin('reload');
    action.onMessage('ignored', { peerId: 'reload' });
    action.onMessage('accepted', { peerId: 'old' });
    expect(frames).toEqual(['accepted']);
    expect(room.leave).not.toHaveBeenCalled();
    room.onPeerLeave('old');
    action.onMessage('resumed', { peerId: 'reload' });
    expect(frames).toEqual(['accepted', 'resumed']);
    expect(status).toEqual(['join', 'leave', 'join']);
    link.send({ v: 1, t: 'commit', hash: 'a'.repeat(64) });
    await vi.waitFor(() => expect(action.send).toHaveBeenCalledWith(expect.anything(), { target: ['reload'] }));
    link.close(); link.close();
    expect(room.leave).toHaveBeenCalledOnce();
  });
});
