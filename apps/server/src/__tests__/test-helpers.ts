/** Test helper: start an in-process server and a minimal WS client. */
import { WebSocket } from 'ws';
import { startServer, type ServerOpts } from '../server.js';
import type { ClientMsg, ServerMsg } from '@takes/protocol';

export async function startTestServer(opts: Partial<ServerOpts> = {}) {
  const srv = startServer({ port: 0, dbPath: ':memory:', forfeitMs: 1000, ...opts });
  if (!srv.http.listening) {
    await new Promise<void>((resolve) => srv.http.once('listening', () => resolve()));
  }
  const addr = srv.http.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { ...srv, port };
}

export class TestClient {
  ws: WebSocket;
  received: ServerMsg[] = [];
  private waiters: Array<{ pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }> = [];

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString('utf8')) as ServerMsg;
      this.received.push(msg);
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        if (this.waiters[i]!.pred(msg)) {
          const w = this.waiters.splice(i, 1)[0]!;
          w.resolve(msg);
        }
      }
    });
  }

  async ready(): Promise<void> {
    if (this.ws.readyState === this.ws.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(raw: string): void {
    this.ws.send(raw);
  }

  waitFor(pred: (m: ServerMsg) => boolean, timeoutMs = 3000): Promise<ServerMsg> {
    const already = this.received.find(pred);
    if (already) return Promise.resolve(already);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolveWrapped);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error('waitFor timed out'));
      }, timeoutMs);
      const resolveWrapped = (m: ServerMsg) => { clearTimeout(timer); resolve(m); };
      this.waiters.push({ pred, resolve: resolveWrapped });
    });
  }

  close(): void {
    this.ws.close();
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
