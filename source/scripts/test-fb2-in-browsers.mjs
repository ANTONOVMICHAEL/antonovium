import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';

// This runs ANTONOVIUM's actual local-book UI and long FB2 fixture, not just
// a pure geometry mock. The iframe viewport matches a narrow phone.
const server = await createServer({
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error'
});
let error = null;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/tests/reader-browser.html`;
  for (const [engineName, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1100, height: 1000 },
        locale: 'ru-RU',
        hasTouch: true
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('#run:not([disabled])').waitFor({ timeout: 30000 });
      await page.locator('#width').selectOption('390');
      await page.locator('#run').click();
      await page.waitForFunction(() => /^(PASS|FAIL)/.test(
        document.querySelector('#status')?.textContent?.trim() ?? ''
      ), null, { timeout: 180000 });
      const status = (await page.locator('#status').textContent())?.trim() ?? '';
      if (!status.startsWith('PASS')) {
        const checks = await page.locator('#results').textContent();
        throw Error(`${engineName} ${status}: ${checks?.slice(-1600)}`);
      }
      const report = JSON.parse(await page.locator('#results').textContent() || '{}');
      const broken = report.checks?.filter(test => !test.pass) ?? [];
      assert.equal(broken.length, 0, `${engineName}: browser checks failed`);
      assert.ok(report.checks?.some(test => /fb2: 20 single forward taps/.test(test.name)),
        `${engineName}: missing FB2 page-tap check`);
      console.log(`${engineName}: ${report.checks.length} phone-width browser acceptance checks passed.`);
      await page.close();
    } finally { await browser.close(); }
  }
} catch (caught) {
  error = caught;
} finally { await server.close(); }
if (error) throw error;
