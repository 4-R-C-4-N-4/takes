import { describe, it, expect, vi } from 'vitest';
import { TakesClient, type SocketLike } from '../client.js';
import type { ServerMsg } from '@takes/protocol';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
}

class FakeSocket implements SocketLike {
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

describe('TakesClient', () => {
  it('connects, stores a session token on room_created, and sends resume on reconnect', () => {
    (globalThis as any).localStorage = new MemoryStorage();
    let created: FakeSocket;
    const sockets: FakeSocket[] = [];
    const client = new TakesClient({
      url: 'ws://x',
      socketFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; },
      reconnectDelayMs: 0,
    });
    const received: ServerMsg[] = [];
    client.onMessage((m) => received.push(m));

    client.connect();
    created = sockets[0]!;
    created.open();
    created.receive({ t: 'room_created', code: 'ABCD1234', token: 'tok-1', color: 'w', ruleset: '2026.1' });

    expect(received).toHaveLength(1);
    expect(localStorage.getItem('takes.session.ABCD1234')).toBe('tok-1');

    // Simulate a drop and automatic reconnect: the new socket should resume with the stored token.
    created.close();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const second = sockets[1]!;
        second.open();
        expect(second.sent.some((s) => JSON.parse(s).t === 'resume' && JSON.parse(s).token === 'tok-1')).toBe(true);
        client.close();
        resolve();
      }, 5);
    });
  });

  it('only sends when the socket is open', () => {
    const sockets: FakeSocket[] = [];
    const client = new TakesClient({
      url: 'ws://x',
      socketFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    });
    client.connect();
    client.send({ t: 'ping' });
    expect(sockets[0]!.sent).toHaveLength(0);
    sockets[0]!.open();
    client.send({ t: 'ping' });
    expect(sockets[0]!.sent).toHaveLength(1);
    client.close();
  });
});
