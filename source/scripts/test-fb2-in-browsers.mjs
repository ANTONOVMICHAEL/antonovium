import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

// Chromium: actual ANTONOVIUM FB2 reading UI at phone width.
// WebKit: actual mobile reader CSS with tall content; the WebKit runner's
// IndexedDB bootstrap cannot initialize the full synthetic-book harness.
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
      if (engineName === 'WebKit') {
        const css = await readFile(new URL('../src/reader-v2.css', import.meta.url), 'utf8');
        const paragraph = 'Продолжение гражданско-правового исследования. Подробное рассуждение о юридических конструкциях, положениях доктрины, условиях возникновения и защиты субъективных гражданских прав.';
        const text = Array.from({ length: 150 }, () => '<p>' + paragraph + '</p>').join('');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
          css + '</style><style>html,body{margin:0}.reader-application{width:390px;height:760px}.reader-application .reader{height:760px}.reader-application .reader-workspace{height:720px}.reader-application .cloud-book-scroll{height:720px}</style></head><body>' +
          '<div class="reader-application"><main class="reader cloud-reader"><div class="reader-workspace mode-reading"><div id="frame" class="reader-scroll cloud-book-scroll cloud-format-fb2 cloud-layout-pages"><div id="root" class="document fb2-document paged-text">' +
          text + '</div></div></div></main></div></body></html>');
        const geometry = await page.evaluate(() => {
          const frame = document.getElementById('frame');
          const root = document.getElementById('root');
          const css = getComputedStyle(root);
          const max = frame.scrollHeight - frame.clientHeight;
          frame.scrollTop = Math.min(max, 600);
          return { axis: css.getPropertyValue('--fb2-paging-axis').trim(),
            scrollHeight: frame.scrollHeight, clientHeight: frame.clientHeight,
            scrollTop: frame.scrollTop, horizontalOverflow: frame.scrollWidth-frame.clientWidth };
        });
        assert.equal(geometry.axis, 'vertical', 'WebKit did not apply the mobile FB2 mode');
        assert.ok(geometry.scrollHeight > geometry.clientHeight * 3, 'WebKit chapter is not split into screenfuls');
        assert.ok(geometry.scrollTop > 100, 'WebKit cannot advance by a screen of text');
        console.log('WebKit: responsive FB2 CSS has true vertical screen pages and programmatic page advances.');
        console.log('WebKit full-app harness not verified: its IndexedDB bootstrap does not start in this runner.');
        await page.close();
        continue;
      }
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
