/** Entrypoint: `pnpm --filter @takes/server start`. */
import { startServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? './takes.db';
const forfeitMs = Number(process.env.FORFEIT_MS ?? 120_000);
const webDist = process.env.WEB_DIST;

const { close } = startServer({ port, dbPath, forfeitMs, webDist });

console.log(`[takes-server] listening on :${port} (ws path /ws, db ${dbPath})`);

process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
