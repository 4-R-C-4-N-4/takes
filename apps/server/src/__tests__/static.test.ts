import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startTestServer } from './test-helpers.js';

describe('static web serving', () => {
  const dist = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'webdist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html>APP');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'a.js'), 'console.log(1)');
  let srv: Awaited<ReturnType<typeof startTestServer>>;
  beforeAll(async () => { srv = await startTestServer({ webDist: dist }); });
  afterAll(async () => { await srv.close(); });
  const get = (p: string) => fetch(`http://127.0.0.1:${srv.port}${p}`);

  it('serves the app at / and with a query string (regression: /?moves=... returned 404)', async () => {
    for (const p of ['/', '/?moves=e2e4', '/index.html?x=1']) {
      const r = await get(p);
      expect(r.status, p).toBe(200);
      expect(await r.text()).toContain('APP');
    }
  });
  it('serves assets and refuses traversal and directories', async () => {
    expect((await get('/assets/a.js')).status).toBe(200);
    expect((await get('/assets/')).status).toBe(404);
    expect((await get('/../../etc/passwd')).status).toBe(404);
    expect((await get('/%2e%2e/%2e%2e/etc/passwd')).status).toBe(404);
  });
});
