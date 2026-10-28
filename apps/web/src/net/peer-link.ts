/**
 * Peer link abstraction for P2P online play: a 2-party bidirectional channel for PeerFrames.
 * `createLinkPair` is an in-memory implementation for tests; `joinTrysteroLink` is the real
 * WebRTC transport, loaded via dynamic import so non-P2P builds (vs-CPU, server play) never
 * pull Trystero into their bundle.
 */
import type { PeerFrame } from './p2p-protocol.js';

export type PeerEvent = 'join' | 'leave';

export interface PeerLink {
  send(data: PeerFrame): void;
  /** Delivers raw, untrusted peer data — callers must run it through parsePeerFrame. */
  onFrame(cb: (raw: unknown) => void): () => void;
  onPeer(cb: (event: PeerEvent) => void): () => void;
  close(): void;
}

// ---- In-memory pair, for tests: no network, synchronous-ish delivery via microtask. ----

class MemoryLink implements PeerLink {
  private readonly frameListeners = new Set<(raw: unknown) => void>();
  private readonly peerListeners = new Set<(event: PeerEvent) => void>();
  private peer: MemoryLink | null = null;
  closed = false;

  send(data: PeerFrame): void {
    if (this.closed || !this.peer) return;
    const wire: unknown = JSON.parse(JSON.stringify(data));
    const target = this.peer;
    queueMicrotask(() => { if (!target.closed) target.frameListeners.forEach((cb) => cb(wire)); });
  }

  /** Test-only escape hatch to push arbitrary (possibly malformed) data at this peer's listeners. */
  __deliverRaw(raw: unknown): void {
    queueMicrotask(() => this.frameListeners.forEach((cb) => cb(raw)));
  }

  onFrame(cb: (raw: unknown) => void): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  onPeer(cb: (event: PeerEvent) => void): () => void {
    this.peerListeners.add(cb);
    return () => this.peerListeners.delete(cb);
  }

  emitPeer(event: PeerEvent): void { this.peerListeners.forEach((cb) => cb(event)); }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const peer = this.peer;
    this.peer = null;
    peer?.emitPeer('leave');
  }

  _link(other: MemoryLink): void { this.peer = other; }
}

export interface LinkPair {
  host: PeerLink;
  guest: PeerLink;
  /** Simulates a third peer trying to join a 2-party room; always refused, no state change. */
  attemptThirdJoin(): boolean;
  /** Test-only: push malformed/arbitrary data at `host` as if it came from the guest. */
  deliverRawToHost(raw: unknown): void;
  /** Test-only: push malformed/arbitrary data at `guest` as if it came from the host. */
  deliverRawToGuest(raw: unknown): void;
}

/** An in-memory, 2-party PeerLink pair for tests — no network involved. */
export function createLinkPair(): LinkPair {
  const host = new MemoryLink();
  const guest = new MemoryLink();
  host._link(guest);
  guest._link(host);
  queueMicrotask(() => { host.emitPeer('join'); guest.emitPeer('join'); });
  return {
    host,
    guest,
    attemptThirdJoin: () => false,
    deliverRawToHost: (raw) => host.__deliverRaw(raw),
    deliverRawToGuest: (raw) => guest.__deliverRaw(raw),
  };
}

// ---- Real transport: Trystero (WebRTC, BitTorrent-tracker signalling), dynamic-imported. ----

const TRYSTERO_APP_ID = 'io.github.4-r-c-4-n-4.takes';

/** Joins (or creates) the WebRTC room for an invite code and returns a 2-party PeerLink. */
export async function joinTrysteroLink(code: string): Promise<PeerLink> {
  const { joinRoom } = await import('trystero');
  const room = joinRoom({ appId: TRYSTERO_APP_ID, password: code }, code);
  const frameAction = room.makeAction('frame');

  const frameListeners = new Set<(raw: unknown) => void>();
  const peerListeners = new Set<(event: PeerEvent) => void>();
  const peers = new Set<string>();
  let closed = false;

  frameAction.onMessage = (data: unknown) => { if (!closed) frameListeners.forEach((cb) => cb(data)); };

  room.onPeerJoin = (peerId: string) => {
    if (closed) return;
    if (peers.size >= 1) {
      // Already have one peer: refuse a third party by dropping this connection immediately.
      void room.leave();
      closed = true;
      peerListeners.forEach((cb) => cb('leave'));
      return;
    }
    peers.add(peerId);
    peerListeners.forEach((cb) => cb('join'));
  };

  room.onPeerLeave = (peerId: string) => {
    peers.delete(peerId);
    peerListeners.forEach((cb) => cb('leave'));
  };

  return {
    send: (data) => { if (!closed) void frameAction.send(data as never); },
    onFrame: (cb) => { frameListeners.add(cb); return () => frameListeners.delete(cb); },
    onPeer: (cb) => { peerListeners.add(cb); return () => peerListeners.delete(cb); },
    close: () => { if (!closed) { closed = true; void room.leave(); } },
  };
}
