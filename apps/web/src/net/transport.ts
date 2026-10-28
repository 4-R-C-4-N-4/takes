// Transport seam between OnlineGameController and whatever actually carries ClientMsg/ServerMsg
// traffic: a WebSocket to the server (TakesClient) or a PeerLink-backed P2P session
// (GuestSession's loopback transport; the host drives RoomCore directly via its own loopback).
import type { ClientMsg, ServerMsg } from '@takes/protocol';

export type TransportStatus = 'connecting' | 'open' | 'closed';

export interface OnlineTransport {
  send(msg: ClientMsg): void;
  onMessage(cb: (msg: ServerMsg) => void): () => void;
  onStatus(cb: (status: TransportStatus) => void): () => void;
  close(): void;
}
