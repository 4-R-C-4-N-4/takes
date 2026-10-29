// Promotion picker regression (static build served under /takes/): piece art on every option, and
// only the promoting side's own starting non-pawn pieces are offered [D6 own-set promotion].
// Run after `pnpm --filter @takes/web build:static`:
//   PLAYWRIGHT_MODULE=... CHROME_BIN=... node docs/screens/polish/verify-promotion.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', '..', '..', 'apps', 'web', 'dist-static');
const PORT = Number(process.env.STATIC_PORT || 43202);
const BASE = `http://127.0.0.1:${PORT}/takes`;
// White: Octopus (R3B3), Turtle (vDN) and two Tritons (fR3fB3) in front of the king; Black: vanilla.
const WHITE = '2026.3:R{octopus}B1KB{turtle}R/PPP{triton}{triton}PPP/8';
const BLACK = '2026.3:RNBQKBNR/PPPPPPPP/8';
// Triton e2-e5, ...g7-g6 opens the diagonal: e5xh8 promotes (found by a seeded engine search).
const LINE = 'e2e5,g7g6';

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (!p.startsWith('/takes')) { res.writeHead(404); res.end(); return; }
  p = p.slice('/takes'.length) || '/';
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  assert(fs.existsSync(path.join(DIST, 'index.html')), 'run build:static first');
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  try {
    for (const [name, width, height] of [['desktop', 1280, 800], ['phone', 390, 844]]) {
      const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${BASE}/#/lobby`);
      await page.evaluate(([w, b]) => sessionStorage.setItem('takes.hotseat', JSON.stringify({ white: w, black: b, cpu: null })), [WHITE, BLACK]);
      await page.goto(`${BASE}/?moves=${LINE}#/game/hotseat`);
      await page.locator('.piece-cell[data-sq="36"]').waitFor(); // Triton on e5
      await page.waitForFunction(() => /\(2\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? ''));
      const tap = async (sel) => {
        const loc = page.locator(sel);
        await loc.scrollIntoViewIfNeeded();
        const b = await loc.boundingBox();
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      };
      await tap('.piece-cell[data-sq="36"]');
      await tap('.piece-cell[data-sq="63"]'); // capture the h8 rook onto the last rank
      const dialog = page.getByRole('dialog', { name: 'Choose promotion piece' });
      await dialog.waitFor();
      const options = dialog.getByRole('button');
      const labels = (await options.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).sort();
      // Own starting non-pawn pieces only: Rook, Bishop, Octopus (R3B3), Turtle (vDN). No Queen, no Knight
      // (Black's pieces), no Triton (pawn tier).
      assert.equal(labels.length, 4, `${name}: ${labels.join(' | ')}`);
      for (const want of [/Rook/, /Bishop/, /R3B3|Octopus/, /vDN|Turtle/]) {
        assert(labels.some((l) => want.test(l)), `${name}: missing ${want} in ${labels.join(' | ')}`);
      }
      assert(!labels.some((l) => /Queen|Knight|Triton/.test(l)), `${name}: foreign piece offered: ${labels.join(' | ')}`);
      // Every option shows the piece's art (an inline SVG token), not just text.
      const svgCounts = await options.evaluateAll((els) => els.map((e) => e.querySelectorAll('svg').length));
      assert(svgCounts.every((n) => n > 0), `${name}: option without piece art`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: overflow`);
      await page.screenshot({ path: path.join(__dirname, `${name}-promotion.png`) });
      await options.filter({ hasText: /R3B3/ }).click();
      await dialog.waitFor({ state: 'detached' });
      await page.waitForFunction(() => /\(3\)/.test(document.querySelector('.moves .eyebrow')?.textContent ?? ''));
      assert.deepEqual(errors, []);
      console.log(`${name}: promotion picker shows art, own-army pieces only, promotion applied PASS`);
    }
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
