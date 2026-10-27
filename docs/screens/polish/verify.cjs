// Run from the repository root with PLAYWRIGHT_MODULE set to an installed Playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TAKES_URL || 'http://127.0.0.1:43187';
const out = __dirname;
(async () => {
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
      page.on('pageerror', error => errors.push(error.message));
      const click = locator => name === 'phone' ? locator.tap() : locator.click();
      const square = sq => page.locator(`rect[data-sq="${sq}"]`);
      const piece = sq => page.locator(`.piece-cell[data-sq="${sq}"]`);
      const exists = async (sq, present = true) => { await piece(sq).waitFor({ state: present ? 'attached' : 'detached', timeout: 5000 }); assert.equal(await piece(sq).count(), present ? 1 : 0); };
      const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: overflow`);
      const drag = async (source, target) => {
        await source.scrollIntoViewIfNeeded();
        const a = await source.boundingBox();
        const b = target ? await target.boundingBox() : { x: 2, y: 2, width: 2, height: 2 };
        // Real mouse input exercises the shared Pointer Events path on both viewports.
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
        await page.mouse.up();
      };
      await page.goto(`${base}/#/profiles`);
      await page.getByRole('heading', { name: 'Profiles', exact: true }).waitFor();
      assert(await page.getByText('Vanilla', { exact: true }).count());
      await click(page.getByRole('link', { name: 'Builder', exact: true }));
      await click(page.getByTitle('Pawn (1 pts)', { exact: true }));
      await click(square(16)); // a3: pawn placement is legal in this zone.
      await exists(16);
      const rank3 = await page.locator('.rank-label').filter({ hasText: /^3$/ }).boundingBox();
      const rank1 = await page.locator('.rank-label').filter({ hasText: /^1$/ }).boundingBox();
      assert(rank3.y < rank1.y);
      assert.equal(await page.locator('.budget').textContent(), 'Cost: 1 / 39');
      assert(await page.locator('.issues li').count());
      assert(await page.getByRole('button', { name: 'Save profile', exact: true }).isDisabled());
      await drag(page.getByTitle('Knight (3 pts)', { exact: true }), square(17));
      await exists(17);
      await drag(piece(17), square(18));
      await exists(17, false); await exists(18);
      await drag(piece(18), null);
      await exists(18, false);
      await noOverflow();
      await page.screenshot({ path: path.join(out, `${name}-builder-invalid.png`), fullPage: true });
      await click(page.getByRole('button', { name: 'Load vanilla', exact: true }));
      // Move a pawn to rank 3: preserve the king's shield and total cost.
      await drag(piece(8), square(16));
      await exists(8, false); await exists(16);
      assert.equal(await page.locator('.issues li.error').count(), 0);
      await page.getByPlaceholder('Profile name').fill(`Verified ${name}`);
      await noOverflow();
      await page.screenshot({ path: path.join(out, `${name}-builder-valid.png`), fullPage: true });
      await click(page.getByRole('button', { name: 'Save profile', exact: true }));
      await page.getByRole('heading', { name: 'Profiles', exact: true }).waitFor();
      const row = page.locator('li').filter({ has: page.getByText(`Verified ${name}`, { exact: true }) });
      assert.equal(await row.locator('.ok').textContent(), 'valid');
      await click(row.getByRole('link', { name: 'Edit', exact: true }));
      await exists(16); await exists(8, false);
      // Same component, different profile ID: load selected profile without remounting.
      const vanillaId = await page.evaluate(() => JSON.parse(localStorage.getItem('takes.profiles')).find(p => p.name === 'Vanilla').id);
      await page.evaluate(id => { location.hash = `#/builder/${id}`; }, vanillaId);
      await page.waitForFunction(() => document.querySelector('.piece-cell[data-sq="8"]'));
      await exists(16, false);
      await click(page.getByRole('link', { name: 'Profiles', exact: true }));
      const imported = '2026.1:RNBQKBNR/1PPPPPPP/P7';
      await page.getByPlaceholder('Paste a setup string to check it').fill(imported);
      await click(page.getByRole('button', { name: 'Open in builder', exact: true }));
      assert.equal(await page.locator('.setup-io input').inputValue(), imported);
      await click(page.getByRole('link', { name: 'Library', exact: true }));
      await click(page.locator('.piece-card').filter({ has: page.locator('.glyph', { hasText: /^N$/ }) }));
      const oldHighlights = await page.locator('.highlight').count();
      await click(square(0));
      assert.notEqual(await page.locator('.highlight').count(), oldHighlights);
      await noOverflow();
      await click(page.getByRole('link', { name: 'Lobby', exact: true }));
      await page.locator('label').filter({ hasText: /^White / }).locator('select').selectOption(vanillaId);
      await page.locator('label').filter({ hasText: /^Black / }).locator('select').selectOption(vanillaId);
      await click(page.getByRole('button', { name: 'Start hotseat game', exact: true }));
      await piece(12).waitFor();
      for (const [from, to] of [[12, 28], [52, 36], [6, 21], [57, 42]]) {
        await click(piece(from));
        assert(await page.locator('.highlight.quiet').count());
        await click(square(to));
        await exists(from, false); await exists(to);
      }
      assert(await page.getByText('Moves (UCI): 4', { exact: true }).count());
      assert(await page.getByText('To move: White', { exact: true }).count());
      await click(page.getByRole('button', { name: 'Flip board', exact: true }));
      await noOverflow();
      await page.screenshot({ path: path.join(out, `${name}-hotseat.png`), fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`${name}: tap/place, budget/issues, drag/place/move/remove, save/load/navigation/import, library, four hotseat plies, flip, overflow PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
