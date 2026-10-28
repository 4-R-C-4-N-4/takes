// Browser verification of P2P online play against the REAL public Nostr relays Trystero uses
// for signalling (default `trystero` export == `@trystero-p2p/nostr`). Two separate Playwright
// browser contexts (host, guest) serve dist-static under /takes/ via verify-static's tiny
// no-deps server; the actual WebRTC data channel between them connects via host candidates on
// this one machine (no TURN needed). If the relays are unreachable, this prints that plainly and
// fails loudly — it never fakes a pass.
//
// Run: PLAYWRIGHT_MODULE=... CHROME_BIN=... node docs/screens/polish/verify-p2p.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', '..', '..', 'apps', 'web', 'dist-static');
const PORT = Number(process.env.STATIC_PORT || 43198);
const BASE = (process.env.TAKES_URL || `http://127.0.0.1:${PORT}/takes`).replace(/\/$/, '');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (!p.startsWith('/takes')) { res.writeHead(404); res.end('not under /takes/'); return; }
    p = p.slice('/takes'.length) || '/';
    if (p === '/' || p === '') p = '/index.html';
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found: ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

const now = () => Date.now();
const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function withTapHelpers(page, name) {
  const click = (locator) => locator.click();
  const noOverflow = async () =>
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: horizontal overflow`);
  const drag = async (source, target) => {
    await source.scrollIntoViewIfNeeded();
    const a = await source.boundingBox();
    const b = await target.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(80);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  };
  const sq = (s) => page.locator(`[data-sq="${s}"]`);
  const tapMove = async (fromSq, toSq) => drag(sq(fromSq).first(), sq(toSq).first());
  return { click, noOverflow, tapMove };
}

(async () => {
  assert(fs.existsSync(path.join(DIST, 'index.html')), 'dist-static/index.html missing — run `pnpm --filter @takes/web build:static` first');

  const server = serve();
  let browser;
  const diagnostics = [];
  const pages = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', resolve); });

    browser = await chromium.launch({
      executablePath: process.env.CHROME_BIN,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream'],
    });

    const timings = {};
    const mark = (label, startedAt) => { timings[label] = now() - startedAt; };

    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    for (const context of [hostCtx, guestCtx]) await context.addInitScript(() => {
      const Native = window.RTCPeerConnection;
      window.__p2pConnections = [];
      window.RTCPeerConnection = class extends Native {
        constructor(...args) {
          super(...args); window.__p2pConnections.push(this);
          this.addEventListener('connectionstatechange', () => console.log('P2P connection:', this.connectionState, this.iceConnectionState));
        }
      };
    });
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    const hostErrors = []; const guestErrors = [];
    for (const [name, page, errors] of [['host', hostPage, hostErrors], ['guest', guestPage, guestErrors]]) {
      pages.push([name, page]);
      page.on('pageerror', (e) => { errors.push(e.message); diagnostics.push(`${name} pageerror: ${e.stack}`); });
      page.on('console', (msg) => diagnostics.push(`${name} console ${msg.type()}: ${msg.text()}`));
      page.on('requestfailed', (req) => diagnostics.push(`${name} request failed: ${req.url()} ${req.failure()?.errorText}`));
      page.on('websocket', (ws) => {
        diagnostics.push(`${name} websocket open: ${ws.url()}`);
        ws.on('socketerror', (error) => diagnostics.push(`${name} websocket error: ${ws.url()} ${error}`));
        ws.on('close', () => diagnostics.push(`${name} websocket closed: ${ws.url()}`));
      });
    }

    const h = await withTapHelpers(hostPage, 'host');
    const g = await withTapHelpers(guestPage, 'guest');

    // ---- Host: create a game ----
    let t0 = now();
    await hostPage.goto(`${BASE}/`);
    await hostPage.getByRole('heading', { name: 'Play', exact: true }).waitFor();
    await h.click(hostPage.getByRole('button', { name: 'Create game', exact: true }));
    await hostPage.getByText('Invite link', { exact: false }).waitFor({ timeout: 15000 });
    mark('host: lobby -> waiting panel', t0);

    const inviteLink = await hostPage.locator('input[aria-label="Invite link"]').inputValue();
    const codeMatch = inviteLink.match(/#\/join\/([A-Z0-9]+)/i);
    assert(codeMatch, `could not read invite code from link: ${inviteLink}`);
    const code = codeMatch[1];
    console.log(`invite code: ${code}`);

    // ---- Guest: join via the link ----
    t0 = now();
    assert.equal(new URL(inviteLink).pathname, '/takes/', 'invite lost production subpath');
    await guestPage.goto(inviteLink);
    await guestPage.getByRole('heading', { name: 'Join game', exact: true }).waitFor();
    await g.click(guestPage.getByRole('button', { name: 'Join with this army', exact: true }));
    mark('guest: join page -> submitted', t0);

    // ---- Both sides: wait for relay handshake + WebRTC connect (bounded timeout) ----
    async function waitConnected(page, label) {
      const started = now();
      await page.locator('.piece-cell').first().waitFor({ timeout: 60000 });
      mark(`${label}: connect -> board revealed`, started);
    }
    t0 = now();
    await Promise.all([waitConnected(hostPage, 'host'), waitConnected(guestPage, 'guest')]);
    mark('both: relay connect -> both boards revealed', t0);
    for (const page of [hostPage, guestPage]) {
      assert(!/hotseat: you play both sides/.test(await page.locator('body').innerText()), 'P2P game must not be labelled hotseat');
    }

    await hostPage.screenshot({ path: path.join(__dirname, 'p2p-host-ingame.png') });
    await guestPage.screenshot({ path: path.join(__dirname, 'p2p-guest-ingame.png') });

    // ---- 4 plies, deterministic e2-e4-ish taps, alternating host/guest ----
    const plies = [
      { page: hostPage, name: 'host', from: 12, to: 28 }, // e2-e4 equivalent (White)
      { page: guestPage, name: 'guest', from: 52, to: 36 }, // e7-e5 equivalent (Black)
      { page: hostPage, name: 'host', from: 6, to: 21 },
      { page: guestPage, name: 'guest', from: 57, to: 42 },
    ];
    t0 = now();
    for (const [index, ply] of plies.entries()) {
      const helper = ply.page === hostPage ? h : g;
      await helper.tapMove(ply.from, ply.to);
      await Promise.all([hostPage, guestPage].map(page => page.waitForFunction(n => document.querySelector('.moves .eyebrow')?.textContent.includes(`(${n})`), index + 1, { timeout: 15000 }))); 
    }
    // Both sides should now show 4 plies in the move list.
    await hostPage.waitForFunction(() => /\(4\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? ''), undefined, { timeout: 15000 });
    await guestPage.waitForFunction(() => /\(4\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? ''), undefined, { timeout: 15000 });
    mark('4 plies exchanged (both sides see 4)', t0);

    const hostFEN = await hostPage.evaluate(() => Array.from(document.querySelectorAll('.piece-cell')).map((el) => `${el.getAttribute('data-sq')}:${el.innerHTML}`).sort().join(','));
    const guestFEN = await guestPage.evaluate(() => Array.from(document.querySelectorAll('.piece-cell')).map((el) => `${el.getAttribute('data-sq')}:${el.innerHTML}`).sort().join(','));
    assert.equal(hostFEN, guestFEN, 'host/guest board positions diverged after 4 plies');

    // ---- Reload guest mid-game: must resume at the same position ----
    t0 = now();
    await guestPage.reload();
    await guestPage.waitForFunction(() => /\(4\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? ''), undefined, { timeout: 60_000 });
    const guestFENAfterReload = await guestPage.evaluate(() => Array.from(document.querySelectorAll('.piece-cell')).map((el) => `${el.getAttribute('data-sq')}:${el.innerHTML}`).sort().join(','));
    assert.equal(guestFENAfterReload, hostFEN, 'guest position diverged after reload');
    mark('guest reload -> resumed at same position', t0);

    // ---- Reload host mid-game: must resume too ----
    t0 = now();
    await hostPage.reload();
    await hostPage.waitForFunction(() => /\(4\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? ''), undefined, { timeout: 60_000 });
    const hostFENAfterReload = await hostPage.evaluate(() => Array.from(document.querySelectorAll('.piece-cell')).map((el) => `${el.getAttribute('data-sq')}:${el.innerHTML}`).sort().join(','));
    assert.equal(hostFENAfterReload, hostFEN, 'host position diverged after reload');
    mark('host reload -> resumed at same position', t0);
    // Resigning immediately also verifies that the re-established data channel carries traffic.
    await Promise.all([hostPage, guestPage].map(page => page.waitForFunction(() => window.__p2pConnections?.some(pc => pc.connectionState === 'connected'), undefined, { timeout: 60000 }))); 

    // ---- Guest resigns; both sides show the result ----
    t0 = now();
    await g.click(guestPage.getByRole('button', { name: 'Resign', exact: true }));
    await g.click(guestPage.getByRole('button', { name: 'Confirm resign', exact: true }));
    await guestPage.getByRole('alertdialog', { name: 'Game over', exact: true }).waitFor({ timeout: 15000 });
    await hostPage.getByRole('alertdialog', { name: 'Game over', exact: true }).waitFor({ timeout: 15000 });
    for (const page of [hostPage, guestPage]) {
      assert.equal(await page.getByRole('alertdialog', { name: 'Game over' }).getByRole('heading').innerText(), '1-0');
      assert.match(await page.getByRole('alertdialog', { name: 'Game over' }).innerText(), /resign/);
    }
    mark('guest resigns -> both see result', t0);

    await hostPage.screenshot({ path: path.join(__dirname, 'p2p-host-result.png') });
    await guestPage.screenshot({ path: path.join(__dirname, 'p2p-guest-result.png') });

    assert.deepEqual(hostErrors, [], `host console/page errors: ${hostErrors.join(' | ')}`);
    assert.deepEqual(guestErrors, [], `guest console/page errors: ${guestErrors.join(' | ')}`);

    console.log('\nTimings:');
    for (const [label, ms] of Object.entries(timings)) console.log(`  ${label}: ${fmt(ms)}`);
    console.log('\nverify-p2p: PASS (two real browser contexts, public Nostr relay signalling, local WebRTC data channel)');
    await hostCtx.close();
    await guestCtx.close();
  } catch (error) {
    process.exitCode = 1;
    diagnostics.push(error.stack || String(error));
    for (const [name, page] of pages) {
      diagnostics.push(`${name} URL: ${page.url()}`);
      diagnostics.push(`${name} body: ${(await page.locator('body').innerText().catch(() => 'unavailable')).slice(0, 6000)}`);
      await page.screenshot({ path: path.join(__dirname, `p2p-${name}-failure.png`) }).catch(() => {});
    }
    throw error;
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      fs.writeFileSync(path.join(__dirname, 'p2p-diagnostics.log'), diagnostics.join('\n'));
    }
  }
})().catch((e) => {
  console.error('verify-p2p: FAIL');
  console.error(e);
  process.exitCode = 1;
});
