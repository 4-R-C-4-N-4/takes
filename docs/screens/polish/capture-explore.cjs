// One-off screenshot capture for visual QA: Library + Lab, desktop + phone.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const base = process.env.TAKES_URL || 'http://127.0.0.1:48214';
const outDir = path.join(__dirname, '../../../docs/screens/redesign');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  try {
    for (const [name, width, height] of [['desktop', 1280, 800], ['phone', 390, 844]]) {
      const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
      await page.goto(`${base}/#/library`);
      await page.locator('.piece-card').filter({ has: page.locator('.glyph', { hasText: /^X$/ }) }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, `explore-library-${name}.png`), fullPage: true });

      await page.goto(`${base}/#/candidates`);
      await page.getByLabel('Tier').selectOption('minor');
      await page.waitForTimeout(200);
      await page.locator('button.row').first().click();
      await page.getByRole('button', { name: 'Keep', exact: true }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outDir, `explore-lab-${name}.png`), fullPage: true });
      await page.close();
    }
    console.log('screenshots written to', outDir);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
