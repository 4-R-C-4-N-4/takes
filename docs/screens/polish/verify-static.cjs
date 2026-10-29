// Verifies the static production build (apps/web/dist-static) with a tiny
// no-deps http server that mirrors subpath hosting at /takes/ (GitHub Pages
// project-site style: https://4-r-c-4-n-4.github.io/takes/). No Playwright
// browser contexts here talk to anything but this local server.
//
// Checks: no Lab nav / no Lab route, server-bot + invite/join replaced by an
// P2P opt-in controls, vs-CPU + hotseat + Builder + Library
// all work, zero cross-origin requests, no console errors, no horizontal
// overflow on desktop (1280x800) and phone (390x844) viewports.
//
// Run: PLAYWRIGHT_MODULE=... CHROME_BIN=... node docs/screens/polish/verify-static.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', '..', '..', 'apps', 'web', 'dist-static');
const PORT = Number(process.env.STATIC_PORT || 43199);
const BASE = `http://127.0.0.1:${PORT}/takes`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return http.createServer((req, res) => {
    // Mirror GitHub Pages project-site hosting: everything lives under /takes/.
    let p = req.url.split('?')[0];
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; } // browser tab icon probe, outside /takes/
    if (!p.startsWith('/takes')) {
      res.writeHead(404);
      res.end('not under /takes/');
      return;
    }
    p = p.slice('/takes'.length) || '/';
    if (p === '/' || p === '') p = '/index.html';
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found: ' + p); return; }
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

(async () => {
  assert(fs.existsSync(path.join(DIST, 'index.html')), 'dist-static/index.html missing — run `pnpm --filter @takes/web build:static` first');

  const server = serve();
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const [name, width, height] of [['desktop', 1280, 800], ['phone', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: name === 'phone' });
      const page = await context.newPage();
      const errors = [];
      const offOriginRequests = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('websocket', (ws) => offOriginRequests.push(ws.url()));
      page.on('request', (req) => {
        const u = new URL(req.url());
        if (u.host !== `127.0.0.1:${PORT}`) offOriginRequests.push(req.url());
      });

      const click = (locator) => locator.click();
      const noOverflow = async () =>
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          `${name}: horizontal overflow`,
        );
      // Tap-select, tap-destination via raw mouse events at element-center
      // coordinates (bypasses Playwright's locator.click() actionability check,
      // which the piece-art foreignObject fails even though real clicks work).
      const drag = async (source, target) => {
        await source.scrollIntoViewIfNeeded();
        const a = await source.boundingBox();
        const b = await target.boundingBox();
        // Pointer Events (not Touch Events) drive the app's drag/tap-select path on
        // both viewports, so a plain mouse down/up works for the phone context too.
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(80);
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.mouse.down();
        await page.mouse.up();
      };
      const boardState = () => page.evaluate(() => Array.from(document.querySelectorAll('.piece-cell')).map((el) => el.getAttribute('data-sq')).sort().join(','));
      // Tries every piece against every other square until one legal move lands
      // (some starting pieces, e.g. a boxed-in rook, have none — don't assume `first()` can move).
      const anyLegalMove = async () => {
        const before = await boardState();
        const pieces = page.locator('.piece-cell');
        const pieceCount = await pieces.count();
        const squares = page.locator('[data-sq]');
        const squareCount = await squares.count();
        for (let i = 0; i < pieceCount; i++) {
          const from = pieces.nth(i);
          const fromSq = await from.getAttribute('data-sq');
          for (let j = 0; j < squareCount; j++) {
            const to = squares.nth(j);
            if ((await to.getAttribute('data-sq')) === fromSq) continue;
            await drag(from, to);
            await page.waitForTimeout(80);
            if ((await boardState()) !== before) return true;
          }
        }
        return false;
      };

      await page.goto(`${BASE}/`);
      await page.getByRole('heading', { name: 'Play', exact: true }).waitFor();

      // No Lab nav item, no way to reach the candidates screen.
      assert.equal(await page.getByRole('link', { name: 'Lab', exact: true }).count(), 0, `${name}: Lab nav present`);
      await page.evaluate(() => { location.hash = '#/candidates'; });
      await page.waitForTimeout(50);
      await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
      await page.getByRole('heading', { name: 'Play', exact: true }).waitFor();
      assert.equal(await page.locator('.candidate-screen, [data-screen="candidates"]').count(), 0, `${name}: candidates screen reachable`);
      await page.evaluate(() => { location.hash = '#/lobby'; });

      // Server-only features are gone; a self-serve "Play a friend online" P2P section sits in
      // their slot (create/join by code, no server round trip).
      assert.equal(await page.getByText('Server bot level', { exact: false }).count(), 0, `${name}: server bot control present`);
      assert.equal(await page.getByRole('button', { name: 'Create invite link', exact: true }).count(), 0, `${name}: invite present`);
      await page.getByRole('heading', { name: 'Play a friend online', exact: true }).waitFor();
      assert(await page.getByText('public relays', { exact: false }).count() > 0, `${name}: P2P privacy line missing`);
      assert(await page.getByRole('button', { name: 'Create game', exact: true }).count() > 0, `${name}: P2P create-game control missing`);
      await noOverflow();

      // vs-CPU: Easy game, one human move, CPU replies.
      await click(page.getByLabel('Opponent', { exact: true }));
      await page.selectOption('#cpu-side', 'w');
      await click(page.locator('#cpu-level button', { hasText: 'Easy' }));
      await page.selectOption('#cpu-army', '2026.3:R{halo}B1KB{jester}R/PPPPPPPP/8');
      await click(page.getByRole('button', { name: 'Play', exact: true }));
      await page.locator('.piece-cell[data-sq="60"]').waitFor(); // both armies revealed
      assert.equal(JSON.parse(await page.evaluate(() => sessionStorage.getItem('takes.hotseat'))).cpu, 'b');
      const payload = JSON.parse(await page.evaluate(() => sessionStorage.getItem('takes.hotseat')));
      assert.notEqual(payload.white.split(':')[1].split('/')[0], payload.black.split(':')[1].split('/')[0], `${name}: CPU starting rank mirrors player`);
      assert.equal(await page.locator('.piece-cell[data-sq="59"]').count(), 0, `${name}: non-mirror Black rank missing`);
      assert.equal(await page.locator('.piece-cell[data-sq="3"]').count(), 1);
      const blackPawn = page.locator('.piece-cell[data-sq="52"]');
      await blackPawn.scrollIntoViewIfNeeded();
      const pawnBox = await blackPawn.boundingBox();
      await page.mouse.click(pawnBox.x + pawnBox.width / 2, pawnBox.y + pawnBox.height / 2);
      await page.getByTestId('piece-inspector').waitFor();
      assert(await page.locator('.mark-dot').count() > 0, `${name}: inspect moves missing`);
      assert(await page.locator('.mark-ring').count() > 0, `${name}: inspect attacks missing`);
      await noOverflow();
      await click(page.getByRole('button', { name: 'Clear piece inspection' }));
      assert.equal(await page.getByTestId('piece-inspector').count(), 0);
      assert.equal(await page.locator('.mark-dot, .mark-ring').count(), 0);
      await drag(page.locator('.piece-cell[data-sq="12"]'), page.locator('rect[data-sq="28"]')); // e2-e4
      await page.locator('.piece-cell[data-sq="28"]').waitFor();
      // Any Black reply counts (a king step like Ke8-d8 vacates no 'home' square), so wait for the
      // move list to reach two plies with White to move again.
      await page.waitForFunction(() => /\(2\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? '') &&
        /To move: White/.test(document.body.innerText), undefined, { timeout: 10000 });
      await noOverflow();
      // Play again restarts the SAME match (same armies, colour, CPU) instead of going to the lobby.
      const gameUrl = page.url();
      await click(page.getByRole('button', { name: 'Resign', exact: true }));
      await click(page.getByRole('button', { name: 'Confirm resign', exact: true }));
      const over = page.getByRole('alertdialog', { name: 'Game over', exact: true });
      await over.waitFor();
      await click(over.getByRole('button', { name: 'Play again', exact: true }));
      await over.waitFor({ state: 'detached' });
      assert.equal(page.url(), gameUrl, `${name}: Play again left the game route`);
      await page.waitForFunction(() => /\(0\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? ''));
      await page.locator('.piece-cell[data-sq="60"]').waitFor();
      assert.equal(await page.locator('.piece-cell[data-sq="28"]').count(), 0, `${name}: board not reset`);
      assert.equal(await page.locator('.piece-cell[data-sq="59"]').count(), 0, `${name}: CPU army changed on restart`);
      await page.waitForTimeout(800); // a stale CPU reply from the old game must not land
      assert(/\(0\)/.test(await page.locator('.moves .eyebrow').first().innerText()), `${name}: stale CPU move after restart`);
      await drag(page.locator('.piece-cell[data-sq="12"]'), page.locator('rect[data-sq="28"]'));
      await page.waitForFunction(() => /\(2\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? '') &&
        /To move: White/.test(document.body.innerText), undefined, { timeout: 10000 });
      await page.evaluate(() => { location.hash = '#/lobby'; });
      await page.waitForFunction(() => location.hash.includes('lobby'));
      await page.getByRole('heading', { name: 'Play', exact: true }).waitFor();

      // Hotseat: a couple of plies, both sides human, same device.
      await click(page.getByRole('button', { name: 'Hotseat (play both sides)', exact: true }));
      await page.locator('.piece-cell[data-sq="60"]').waitFor(); // both armies revealed
      await drag(page.locator('.piece-cell[data-sq="12"]'), page.locator('rect[data-sq="28"]'));
      await page.locator('.piece-cell[data-sq="28"]').waitFor();
      await drag(page.locator('.piece-cell[data-sq="52"]'), page.locator('rect[data-sq="36"]'));
      await page.locator('.piece-cell[data-sq="36"]').waitFor();
      await noOverflow();
      await page.evaluate(() => { location.hash = '#/lobby'; });

      // Builder: place a piece.
      await click(page.getByRole('link', { name: 'Builder', exact: true }));
      await page.getByRole('heading', { name: 'Builder', exact: true }).waitFor();
      await click(page.getByTitle('Pawn (1 pts)', { exact: true }));
      const emptySquare = page.locator('rect[data-sq]').first();
      await click(emptySquare);
      await page.waitForFunction(() => document.querySelectorAll('.piece-cell').length > 0);
      await noOverflow();

      // Library opens.
      await click(page.getByRole('link', { name: 'Library', exact: true }));
      await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
      await noOverflow();

      // Armies: the per-army actions menu (phone: the ⋯ toggle) must open fully on screen.
      await click(page.getByRole('link', { name: 'Armies', exact: true }));
      await page.getByRole('heading', { name: 'Armies', exact: true }).waitFor();
      const more = page.locator('summary.overflow-toggle').first();
      if (await more.isVisible()) {
        await click(more);
        const panel = page.locator('.overflow-panel').first();
        await panel.waitFor();
        const box = await panel.boundingBox();
        const vw = await page.evaluate(() => innerWidth);
        assert(box.x >= 0 && box.x + box.width <= vw, `${name}: armies menu off-screen (${box.x}..${box.x + box.width} of ${vw})`);
        await click(more);
      }

      assert.equal(offOriginRequests.length, 0, `${name}: cross-origin requests: ${offOriginRequests.join(', ')}`);
      assert.deepEqual(errors, [], `${name}: console/page errors: ${errors.join(' | ')}`);
      console.log(`${name}: no Lab, no server-only controls, vs-CPU + hotseat + Builder + Library OK, zero off-origin requests, no console errors, no overflow — PASS`);
      await context.close();
    }
    console.log('verify-static: PASS');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
