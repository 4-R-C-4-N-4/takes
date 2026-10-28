// Library preview regression: moves vs attacks toggle. Run with the same env as verify.cjs.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TAKES_URL || 'http://127.0.0.1:43187';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/#/library`);
    await page.locator('.piece-card').filter({ has: page.locator('.glyph', { hasText: /^P$/ }) }).click(); // pawn: quiet forward, diagonal captures
    const count = (cls) => page.locator(`.highlight.${cls}`).count();
    assert((await count('quiet')) > 0, 'pawn shows quiet moves');
    assert((await count('capture')) > 0, 'pawn shows attacks');
    await page.getByRole('button', { name: 'Attacks', exact: true }).click();
    assert.equal(await count('quiet'), 0);
    assert((await count('capture')) > 0);
    await page.screenshot({ path: path.join(__dirname, 'library-attacks.png'), fullPage: true });
    await page.getByRole('button', { name: 'Moves + attacks', exact: true }).click();
    await page.locator('.piece-card').filter({ has: page.locator('.glyph', { hasText: /^R$/ }) }).click();
    assert((await count('both')) > 0, 'rook squares show move-or-capture');
    await page.screenshot({ path: path.join(__dirname, 'library-both.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('library preview: quiet/attack/both marks and Attacks toggle PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
