/** HTTP + WebSocket server (one port, path /ws) [impl.md "Server"]. */
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMsg, type ServerMsg } from '@takes/protocol';
import { RoomManager, type Room, type SeatInfo } from './rooms.js';
import { TokenBucket } from './rate-limit.js';

export interface ServerOpts {
  port: number;
  dbPath: string;
  forfeitMs: number;
  webDist?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

interface ConnState {
  room: Room | null;
  seat: SeatInfo | null;
  bucket: TokenBucket;
  badMessages: number;
}

export function startServer(opts: ServerOpts): { http: HttpServer; wss: WebSocketServer; rooms: RoomManager; close: () => Promise<void> } {
  const rooms = new RoomManager({ dbPath: opts.dbPath, forfeitMs: opts.forfeitMs });

  const http = createHttpServer((req, res) => {
    void (async () => {
      const url = req.url ?? '/';
      if (opts.webDist && existsSync(opts.webDist)) {
        const rel = url === '/' ? '/index.html' : url.split('?')[0]!;
        const filePath = join(opts.webDist, rel);
        if (filePath.startsWith(opts.webDist) && existsSync(filePath)) {
          try {
            const data = await readFile(filePath);
            res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
            res.end(data);
            return;
          } catch { /* fall through to 404 */ }
        }
      }
      if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    })();
  });

  const wss = new WebSocketServer({ server: http, path: '/ws' });

  wss.on('connection', (ws) => {
    const state: ConnState = { room: null, seat: null, bucket: new TokenBucket(30, 10), badMessages: 0 };

    ws.on('message', (data) => {
      if (!state.bucket.take()) {
        send(ws, { t: 'error', code: 'bad_message', message: 'rate limit exceeded' });
        return;
      }
      let raw: string;
      try { raw = typeof data === 'string' ? data : data.toString('utf8'); } catch { raw = ''; }
      const msg = parseClientMsg(raw);
      if (!msg) {
        state.badMessages++;
        send(ws, { t: 'error', code: 'bad_message', message: 'malformed message' });
        if (state.badMessages > 10) ws.close();
        return;
      }

      try {
        handleMessage(rooms, state, ws, msg);
      } catch (e) {
        // Never leak internals/stack traces to the client.
        if (process.env.TAKES_DEBUG) console.error(e);
        send(ws, { t: 'error', code: 'bad_message', message: 'internal error' });
      }
    });

    ws.on('close', () => {
      if (state.room && state.seat) rooms.onDisconnect(state.room, state.seat);
    });
  });

  http.listen(opts.port);

  return {
    http, wss, rooms,
    close: () => new Promise<void>((resolve) => {
      rooms.close();
      wss.close(() => { http.close(() => resolve()); });
      for (const client of wss.clients) client.terminate();
    }),
  };
}

function handleMessage(rooms: RoomManager, state: ConnState, ws: WebSocket, msg: import('@takes/protocol').ClientMsg): void {
  switch (msg.t) {
    case 'ping':
      send(ws, { t: 'pong' });
      return;
    case 'create_room': {
      const result = rooms.createRoom(msg.ruleset, msg.color);
      if ('error' in result) { send(ws, { t: 'error', code: 'no_room', message: result.error }); return; }
      const { room, seat } = result;
      state.room = room; state.seat = seat;
      rooms.onConnect(room, seat, ws);
      send(ws, { t: 'room_created', code: room.code, token: seat.token, color: seat.color, ruleset: msg.ruleset });
      return;
    }
    case 'join_room': {
      const result = rooms.joinRoom(msg.code);
      if ('error' in result) { send(ws, { t: 'error', code: result.error === 'room is full' ? 'room_full' : 'no_room', message: result.error }); return; }
      const { room, seat } = result;
      state.room = room; state.seat = seat;
      rooms.onConnect(room, seat, ws);
      send(ws, { t: 'joined', code: room.code, token: seat.token, color: seat.color, ruleset: room.rulesetVersion });
      return;
    }
    case 'resume': {
      const result = rooms.resume(msg.token);
      if ('error' in result) { send(ws, { t: 'error', code: 'bad_token', message: result.error }); return; }
      const { room, seat } = result;
      state.room = room; state.seat = seat;
      rooms.onConnect(room, seat, ws);
      send(ws, { t: 'state', state: room.stateFor(seat.color) });
      return;
    }
    case 'submit_setup': {
      if (!requireSeat(state, ws)) return;
      if (state.room!.phase !== 'setup') { send(ws, { t: 'error', code: 'wrong_phase', message: 'setup already submitted' }); return; }
      const issues = rooms.submitSetup(state.room!, state.seat!, msg.setup);
      if (issues) { send(ws, { t: 'setup_rejected', issues: issues as unknown as import('@takes/protocol').WireIssue[] }); return; }
      send(ws, { t: 'setup_accepted' });
      return;
    }
    case 'move': {
      if (!requireSeat(state, ws)) return;
      const err = rooms.applyMove(state.room!, state.seat!.color, msg.uci, msg.ply);
      if (err) {
        const code = err === 'stale_ply' ? 'stale_ply' : err === 'not_your_turn' ? 'not_your_turn' : 'wrong_phase';
        send(ws, { t: 'move_rejected', reason: err, ply: msg.ply });
        if (code === 'stale_ply' || code === 'not_your_turn') send(ws, { t: 'error', code, message: err });
      }
      return;
    }
    case 'resign':
      if (!requireSeat(state, ws)) return;
      rooms.resign(state.room!, state.seat!.color);
      return;
    case 'offer_draw':
      if (!requireSeat(state, ws)) return;
      rooms.offerDraw(state.room!, state.seat!.color);
      return;
    case 'accept_draw':
      if (!requireSeat(state, ws)) return;
      rooms.acceptDraw(state.room!, state.seat!.color);
      return;
  }
}

function requireSeat(state: ConnState, ws: WebSocket): boolean {
  if (!state.room || !state.seat) {
    send(ws, { t: 'error', code: 'no_room', message: 'not in a room; join or resume first' });
    return false;
  }
  return true;
}
