import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: 'custom'
});
try {
  const { fb2Geometry, restoreFB2Position } =
    await vite.ssrLoadModule('/src/fb2Pagination.ts');
  const nativeGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = root => ({
    getPropertyValue(name) { return name === '--fb2-paging-axis' ? root.axis : ''; },
    lineHeight: '36px', paddingLeft: '24px', paddingRight: '24px', columnGap: '48px'
  });
  try {
    // Reproduce the mobile failure: the browser reports no horizontal overflow,
    // despite the real FB2 chapter containing several screens of text.
    const root = { axis: 'vertical', clientWidth: 390, querySelector: () => null };
    const frame = { clientWidth: 390, clientHeight: 640,
      scrollWidth: 390, scrollHeight: 3040, scrollLeft: 0, scrollTop: 0 };
    let geometry = fb2Geometry(frame, root);
    assert.equal(geometry.vertical, true);
    assert.equal(geometry.page, 1);
    assert.ok(geometry.pages >= 4, 'Long chapter must have multiple phone pages');
    for (let page = 2; page <= geometry.pages; page++) {
      frame.scrollTop = Math.min(geometry.max, (page - 1) * geometry.step);
      assert.equal(fb2Geometry(frame, root).page, page,
        'One tap must advance exactly one screen, not an entire chapter');
    }
    restoreFB2Position(frame, root, { format: 'fb2', chapter: 'same-chapter', page: 2 }, true);
    assert.equal(fb2Geometry(frame, root).page, 2, 'Restore must preserve page number');
    restoreFB2Position(frame, root, { format: 'fb2', chapter: 'same-chapter', page: 2 }, true, true);
    assert.equal(fb2Geometry(frame, root).page, geometry.pages, 'Back navigation opens chapter end');

    frame.scrollHeight = 640; frame.scrollTop = 0;
    geometry = fb2Geometry(frame, root);
    assert.equal(geometry.pages, 1, 'Actually short chapter remains one page');

    // Desktop CSS-columns retain their original horizontal pagination.
    root.axis = '';
    frame.scrollHeight = 640;
    frame.scrollWidth = 2730;
    frame.scrollLeft = 780;
    geometry = fb2Geometry(frame, root);
    assert.equal(geometry.vertical, false);
    assert.equal(geometry.pages, 7);
    assert.equal(geometry.page, 3);
    console.log('FB2 phone-page and desktop-column geometry tests passed.');
  } finally { globalThis.getComputedStyle = nativeGetComputedStyle; }
} finally { await vite.close(); }
