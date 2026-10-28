// Candidates review page regression. Same env as verify.cjs (TAKES_URL, PLAYWRIGHT_MODULE, CHROME_BIN).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TAKES_URL || 'http://127.0.0.1:43187';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  try {
    for (const [name, width, height] of [['desktop', 1280, 900], ['phone', 390, 844]]) {
      const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/#/candidates`);
      await page.getByRole('heading', { name: 'Candidates', exact: true }).waitFor();
      const rows = page.locator('button.row');
      await rows.first().waitFor();
      assert((await rows.count()) >= 10, 'shortlist rows render');
      const matchingMoves = page.getByRole('checkbox', { name: 'Same moves & attacks', exact: true });
      assert(await matchingMoves.isChecked(), 'same moves/attacks defaults ON');
      // Both sources honour the filter; changing it must narrow the actual list.
      const sources = await page.getByLabel('Data source').count() ? ['main', 'fourway'] : [null];
      for (const source of sources) {
        if (source) await page.getByLabel('Data source').selectOption(source);
        await page.getByLabel('View').selectOption('all');
        await rows.first().waitFor();
        const countMatches = async () => Number((await page.getByRole('status').innerText()).match(/^(\d+)/)[1]);
        const filtered = await countMatches();
        await matchingMoves.uncheck();
        assert(await countMatches() > filtered, `${source}: allowing split movement expands list`);
        await matchingMoves.check();
        assert.equal(await countMatches(), filtered, `${source}: filter is reversible`);
      }
      await page.getByLabel('View').selectOption('shortlist');
      // Pick a minor-tier candidate so the test drive places it on b1/g1.
      await page.getByLabel('Tier').selectOption('minor');
      const notation = await rows.first().locator('.betza').innerText();
      await rows.first().click();
      const count = (cls) => page.locator(`.highlight.${cls}`).count();
      assert((await count('quiet')) + (await count('capture')) + (await count('both')) > 0, 'preview shows destinations');
      await page.getByRole('button', { name: 'Attacks', exact: true }).click();
      assert.equal(await count('quiet'), 0);
      assert((await count('capture')) > 0, 'attack view shows attacked squares');
      await page.getByRole('button', { name: 'Keep', exact: true }).click();
      await page.getByPlaceholder('e.g. Hydra').fill(`Test ${name}`);
      await page.getByPlaceholder('e.g. Hydra').press('Tab');
      assert.equal(await page.locator('button.row .verdict.keep').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: overflow`);
      await page.screenshot({ path: path.join(__dirname, `${name}-candidates.png`), fullPage: true });
      // Verdicts survive reload and appear under "My verdicts".
      await page.reload();
      await page.getByLabel('View').selectOption('reviewed');
      await rows.first().waitFor();
      assert.equal(await rows.count(), 1);
      assert.match(await rows.first().innerText(), new RegExp(`Test ${name}`));
      assert((await rows.first().locator('.betza').innerText()).startsWith(notation), 'notation stays primary after naming');
      // Test drive: hotseat game with the candidate in the knight slots.
      await rows.first().click();
      await page.getByRole('button', { name: 'Hotseat (play both sides)', exact: true }).click();
      await page.locator('.piece-cell[data-sq="1"]').waitFor();
      await page.waitForTimeout(600);
      assert.equal(await page.locator('.piece-cell[data-sq="6"]').count(), 1, 'candidate also on g1');
      // Open the b1 diagonal (c2-c3, ...e7-e6), then the candidate must have moves.
      for (const [from, to] of [[10, 18], [52, 44]]) {
        await page.locator(`.piece-cell[data-sq="${from}"]`).click();
        await page.locator(`rect[data-sq="${to}"]`).click();
        await page.locator(`.piece-cell[data-sq="${to}"]`).waitFor();
      }
      await page.locator('.piece-cell[data-sq="1"]').click();
      const dests = await page.locator('.highlight.quiet, .highlight.capture').count();
      assert(dests > 0, 'candidate on b1 has legal moves in the sandbox game');
      await page.screenshot({ path: path.join(__dirname, `${name}-candidate-testdrive.png`), fullPage: true });
      assert.deepEqual(errors, []);
      // Versus CPU: after White's move, the CPU answers as Black on its own.
      await page.goto(`${base}/#/candidates`);
      await page.getByLabel('View').selectOption('reviewed');
      await rows.first().click();
      await page.getByRole('button', { name: 'Test drive vs CPU', exact: true }).click();
      await page.locator('.piece-cell[data-sq="12"]').waitFor();
      await page.waitForTimeout(600);
      await page.locator('.piece-cell[data-sq="12"]').click();
      await page.locator('rect[data-sq="28"]').click();
      await page.waitForFunction(() => /To move: White/.test(document.body.innerText), null, { timeout: 5000 });
      const blackMoved = await page.evaluate(() => [48, 49, 50, 51, 52, 53, 54, 55, 57, 62].some((s) => !document.querySelector(`.piece-cell[data-sq="${s}"]`)));
      assert(blackMoved, 'CPU replied with a Black move');
      console.log(`${name}: candidates list, preview, attacks toggle, verdict+name persist, test drive PASS`);
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
