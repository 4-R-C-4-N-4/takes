// Adhoc QA screenshot: a game with captures on both sides and a check, desktop + phone.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const base = process.env.TAKES_URL;
const out = path.join(__dirname, '..', 'redesign', 'integrated');
require('node:fs').mkdirSync(out, { recursive: true });
// Scholar's-mate-ish sequence: White takes a pawn, Black takes a pawn, then Black gives check.
// White takes a pawn (Nxe5 via knight), Black takes a pawn back, then Black's bishop gives check.
const moves = ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5', 'd2d4', 'f8b4'].join(',');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  for (const [name, w, h] of [['desktop', 1280, 800], ['phone', 390, 844]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    await page.goto(`${base}/#/lobby`);
    await page.evaluate(() => sessionStorage.setItem('takes.hotseat', JSON.stringify({ white: '2026.2:RNBQKBNR/PPPPPPPP/8', black: '2026.2:RNBQKBNR/PPPPPPPP/8', cpu: null })));
    await page.goto(`${base}/?moves=${moves}#/game/hotseat`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${name}-game-captures-check.png`), fullPage: false });
  }
  await browser.close();
  console.log('wrote captures/check screenshots to', out);
})();
