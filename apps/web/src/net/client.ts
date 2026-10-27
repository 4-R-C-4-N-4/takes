// Typed WebSocket client for the online lobby/game, with reconnect + token resume
// [impl.md "Server" / "Messages"]. Accepts a socket factory so tests can inject a fake socket.
import type { ClientMsg, ServerMsg } from '@takes/protocol';

export interface SocketLike {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

export const defaultSocketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

function tokenKey(code: string): string { return `takes.session.${code}`; }

export function loadToken(code: string): string | null {
  try { return localStorage.getItem(tokenKey(code)); } catch { return null; }
}

export function saveToken(code: string, token: string): void {
  try { localStorage.setItem(tokenKey(code), token); } catch { /* ignore */ }
}

export interface ClientOpts {
  url: string;
  socketFactory?: SocketFactory;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

export class TakesClient {
  private socket: SocketLike | null = null;
  private readonly url: string;
  private readonly factory: SocketFactory;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private currentCode: string | null = null;
  private readonly listeners = new Set<(msg: ServerMsg) => void>();
  private readonly statusListeners = new Set<(status: 'connecting' | 'open' | 'closed') => void>();

  constructor(opts: ClientOpts) {
    this.url = opts.url;
    this.factory = opts.socketFactory ?? defaultSocketFactory;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 1000;
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 5;
  }

  onMessage(fn: (msg: ServerMsg) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (status: 'connecting' | 'open' | 'closed') => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  connect(code?: string): void {
    this.closedByUser = false;
    this.currentCode = code ?? this.currentCode;
    this.statusListeners.forEach((f) => f('connecting'));
    const socket = this.factory(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.statusListeners.forEach((f) => f('open'));
      if (this.currentCode) {
        const token = loadToken(this.currentCode);
        if (token) this.send({ t: 'resume', token });
      }
    };
    socket.onmessage = (ev) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'room_created' || msg.t === 'joined') {
        this.currentCode = msg.code;
        saveToken(msg.code, msg.token);
      }
      this.listeners.forEach((f) => f(msg));
    };
    socket.onclose = () => {
      this.statusListeners.forEach((f) => f('closed'));
      if (!this.closedByUser && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), this.reconnectDelayMs);
      }
    };
    socket.onerror = () => { /* onclose follows */ };
  }

  send(msg: ClientMsg): void {
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUser = true;
    this.socket?.close();
  }
}
