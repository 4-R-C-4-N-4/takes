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
      await page.getByRole('heading', { name: 'Armies', exact: true }).waitFor();
      assert(await page.getByText('Vanilla', { exact: true }).count());
      await click(page.getByRole('link', { name: 'Builder', exact: true }));
      if (name === 'phone') {
        const rail = page.locator('.palette-rail');
        await rail.scrollIntoViewIfNeeded();
        const box = await rail.boundingBox();
        const cdp = await context.newCDPSession(page);
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
          type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        });
        const x = box.x + 70, y = box.y + Math.min(box.height - 30, 240);
        const before = await rail.evaluate(el => el.scrollTop);
        await touch('touchStart', x, y);
        for (let i = 1; i <= 10; i++) {
          await touch('touchMove', x, y - i * 16);
          await page.waitForTimeout(20);
        }
        await touch('touchEnd', x, y - 160);
        await page.waitForTimeout(300);
        assert(await rail.evaluate(el => el.scrollTop) > before, 'touch swipe scrolls palette');
        assert.equal(await page.locator('.palette-piece.selected').count(), 0);
        assert.equal(await page.locator('.piece-cell').count(), 0);
        await rail.evaluate(el => { el.scrollTop = 0; });
        await cdp.detach();
      }
      const info = page.getByRole('button', { name: 'Moves of Knight', exact: true });
      await click(info);
      const sheet = page.getByRole('dialog', { name: 'Moves of Knight', exact: true });
      await sheet.waitFor();
      assert(await sheet.locator('.highlight').count() > 0);
      await click(sheet.getByRole('button', { name: 'Attacks', exact: true }));
      assert.equal(await sheet.getByRole('button', { name: 'Attacks', exact: true }).getAttribute('aria-pressed'), 'true');
      assert(await sheet.locator('.highlight.capture').count() > 0);
      await noOverflow();
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'detached' });
      assert(await info.evaluate(el => el === document.activeElement));
      await click(info);
      await sheet.waitFor();
      await page.mouse.click(2, 2);
      await sheet.waitFor({ state: 'detached' });
      assert.equal(await page.locator('.palette-piece.selected').count(), 0);
      await click(page.getByTitle('Pawn (1 pts)', { exact: true }));
      await click(square(16)); // a3: pawn placement is legal in this zone.
      await exists(16);
      const rank3 = await page.locator('.rank-label').filter({ hasText: /^3$/ }).boundingBox();
      const rank1 = await page.locator('.rank-label').filter({ hasText: /^1$/ }).boundingBox();
      assert(rank3.y < rank1.y);
      assert.equal(await page.locator('.budget').textContent(), 'Cost: 1 / 39');
      assert(await page.getByTitle('Pawn (1 pts)', { exact: true }).evaluate(el => el.classList.contains('selected')));
      await click(square(17)); // same selected pawn, no second palette tap
      await exists(17);
      assert.equal(await page.locator('.budget').textContent(), 'Cost: 2 / 39');
      await click(page.getByTitle('Pawn (1 pts)', { exact: true }));
      assert.equal(await page.locator('.palette-piece.selected').count(), 0);
      assert(await page.locator('.issues li').count());
      assert(await page.getByRole('button', { name: 'Save profile', exact: true }).isDisabled());
      if (name === 'phone') {
        // Hold in the palette, then reveal the board while keeping the touch active.
        await page.locator('.palette-rail').evaluate(el => { el.scrollTop = 0; });
        const knight = page.getByTitle('Knight (3 pts)', { exact: true });
        await knight.scrollIntoViewIfNeeded();
        const a = await knight.boundingBox();

        const cdp = await context.newCDPSession(page);
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
          type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        });
        const x = a.x + a.width / 2, y = a.y + a.height / 2;
        await touch('touchStart', x, y);
        await page.waitForTimeout(300);
        await square(17).scrollIntoViewIfNeeded();
        const b = await square(17).boundingBox();
        const tx = b.x + b.width / 2, ty = b.y + b.height / 2;
        for (let i = 1; i <= 12; i++) {
          await touch('touchMove', x + (tx - x) * i / 12, y + (ty - y) * i / 12);
          await page.waitForTimeout(16);
        }
        await touch('touchEnd', tx, ty);
        await cdp.detach();
        await exists(17);
        assert.equal(await page.locator('.budget').textContent(), 'Cost: 4 / 39');
      }
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
      await page.getByRole('heading', { name: 'Armies', exact: true }).waitFor();
      const row = page.locator('li').filter({ has: page.getByText(`Verified ${name}`, { exact: true }) });
      assert.equal(await row.locator('.chip.good').textContent(), 'valid');
      await click(row.getByRole('link', { name: 'Edit', exact: true }));
      await exists(16); await exists(8, false);
      // Same component, different profile ID: load selected profile without remounting.
      const vanillaId = await page.evaluate(() => JSON.parse(localStorage.getItem('takes.profiles')).find(p => p.name === 'Vanilla').id);
      await page.evaluate(id => { location.hash = `#/builder/${id}`; }, vanillaId);
      await page.waitForFunction(() => document.querySelector('.piece-cell[data-sq="8"]'));
      await exists(16, false);
      await click(page.getByRole('link', { name: 'Armies', exact: true }));
      const imported = '2026.1:RNBQKBNR/1PPPPPPP/P7';
      await page.getByPlaceholder('Paste a setup string to check it').fill(imported);
      await click(page.getByRole('button', { name: 'Open in builder', exact: true }));
      await click(page.getByRole('button', { name: 'Import / Export', exact: true }));
      // An old-version string opens with the same squares under the current ruleset, and says so.
      const current = await page.evaluate(() => document.querySelector('.setup-io input').value.split(':')[0]);
      assert.notEqual(current, '2026.1');
      assert.equal(await page.locator('.setup-io input').inputValue(), `${current}:${imported.split(':')[1]}`);
      await page.getByText(`Built for 2026.1; saving updates it to ${current}.`, { exact: true }).waitFor();
      await click(page.getByRole('link', { name: 'Library', exact: true }));
      await click(page.locator('.piece-card').filter({ has: page.locator('.glyph', { hasText: /^N$/ }) }));
      const oldHighlights = await page.locator('.highlight').count();
      await click(square(0));
      assert.notEqual(await page.locator('.highlight').count(), oldHighlights);
      await noOverflow();
      await click(page.getByRole('link', { name: 'Play', exact: true }));
      await page.getByLabel('Army', { exact: true }).selectOption(vanillaId);
      await click(page.getByRole('button', { name: 'Hotseat (play both sides)', exact: true }));
      await piece(12).waitFor();
      for (const [from, to] of [[12, 28], [52, 36], [6, 21], [57, 42]]) {
        await click(piece(from));
        assert(await page.locator('.highlight.quiet').count());
        await click(square(to));
        await exists(from, false); await exists(to);
      }
      assert(await page.locator('.moves .eyebrow').filter({ hasText: '(4)' }).count());
      assert(await page.getByText(/^To move: White · hotseat/).count());
      await click(page.getByRole('button', { name: 'Flip board', exact: true }));
      await noOverflow();
      await page.screenshot({ path: path.join(out, `${name}-hotseat.png`), fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`${name}: tap/place, budget/issues, drag/place/move/remove, save/load/navigation/import, library, four hotseat plies, flip, overflow PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
