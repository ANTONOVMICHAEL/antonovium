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
  const url = `http://127.0.0.1:${address.port}/tests/reader-browser.html?fb2-only=1`;
  for (const [engineName, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1100, height: 1000 },
        locale: 'ru-RU',
        hasTouch: true
      });
      const browserErrors = [], browserMessages = [];
      page.on('pageerror', error => browserErrors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') browserMessages.push(message.text());
      });
      page.on('requestfailed', request => browserMessages.push(`${request.url()} ${request.failure()?.errorText}`));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      try {
        await page.locator('#run:not([disabled])').waitFor({ timeout: 30000 });
      } catch (error) {
        const details = await page.evaluate(() => ({
          status: document.querySelector('#status')?.textContent,
          html: document.querySelector('#app')?.contentDocument?.body?.textContent?.slice(0, 250),
          ready: document.readyState
        })).catch(() => ({}));
        throw Error(`${engineName} test harness did not load: ${JSON.stringify({
          details, browserErrors, browserMessages: browserMessages.slice(-12)
        })}`, { cause: error });
      }
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
