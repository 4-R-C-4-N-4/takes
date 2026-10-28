// Screenshot every screen on integrated main for orchestrator review.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const path = require('node:path');
const base = process.env.TAKES_URL;
const out = path.join(__dirname, '..', 'redesign', 'integrated');
require('node:fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  for (const [name, w, h] of [['desktop', 1280, 800], ['phone', 390, 844]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
    for (const route of ['lobby', 'builder', 'profiles', 'library', 'candidates']) {
      await page.goto(`${base}/#/${route}`);
      await page.waitForTimeout(700);
      if (route === 'library') { const t = page.locator('.piece-card').nth(6); if (await t.count()) await t.click(); }
      if (route === 'candidates') { const r = page.locator('button.row').first(); if (await r.count()) await r.click(); await page.waitForTimeout(300); }
      await page.screenshot({ path: path.join(out, `${name}-${route}.png`), fullPage: false });
    }
    // Game vs CPU with a few moves.
    await page.goto(`${base}/#/lobby`);
    await page.evaluate(() => sessionStorage.setItem('takes.hotseat', JSON.stringify({ white: '2026.2:RNBQKBNR/PPPPPPPP/8', black: '2026.2:RNBQKBNR/PPPPPPPP/8', cpu: null })));
    await page.goto(`${base}/?moves=e2e4,d7d5,e4d5,d8d5,b1c3#/game/hotseat`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${name}-game.png`), fullPage: false });
  }
  await browser.close();
  console.log('wrote', out);
})();
