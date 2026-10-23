import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { ReaderGestures } = await vite.ssrLoadModule('/src/readerGestures.ts');
  const bounds = { left: 100, width: 390 }, point = (id, x, y, time) => ({ id, x, y, time });
  const g = new ReaderGestures(); let checks = 0;
  function tap(x, blocked = false) { g.start(point(1, x, 200, 1000), blocked); return g.end(point(1, x, 200, 1080), bounds, false); }
  assert.equal(tap(470), 'next'); assert.equal(tap(110), 'previous'); assert.equal(tap(290), 'tools'); checks += 3;
  assert.equal(tap(470, true), null); checks++;
  g.start(point(1, 470, 200, 1000), false); g.move(point(1, 470, 290, 1030)); assert.equal(g.end(point(1, 470, 201, 1100), bounds, false), null); checks++;
  g.start(point(1, 470, 200, 1000), false); g.move(point(1, 465, 202, 1050)); assert.equal(g.end(point(1, 470, 200, 1500), bounds, false), null); checks++;
  g.start(point(1, 470, 200, 1000), false); g.move(point(1, 350, 205, 1070)); assert.equal(g.end(point(1, 350, 205, 1200), bounds, false), 'next'); assert.equal(g.end(point(1, 350, 205, 1201), bounds, false), null); checks += 2;
  g.start(point(1, 290, 200, 1000), false); g.move(point(1, 390, 202, 1510)); assert.equal(g.end(point(1, 390, 202, 1550), bounds, false), null); checks++;
  g.start(point(1, 470, 200, 1000), false); g.start(point(2, 400, 200, 1010), false); assert.equal(g.end(point(2, 400, 200, 1080), bounds, false), null); assert.equal(g.end(point(1, 470, 200, 1090), bounds, false), null); assert.equal(tap(470), 'next'); checks += 3;
  g.start(point(1, 470, 200, 1000), false); g.cancel(1); assert.equal(g.end(point(1, 470, 200, 1080), bounds, false), null); checks++;
  g.start(point(1, 470, 200, 1000), false); g.move(point(1, 350, 280, 1070)); assert.equal(g.end(point(1, 350, 280, 1200), bounds, false), null); checks++;
  g.start(point(1, 470, 200, 1000), false); assert.equal(g.end(point(1, 470, 200, 1080), bounds, true), null); checks++;
  console.log(`${checks} gesture assertions passed: contact ownership, interaction gates, holds, vertical excursion, pinch, cancellation, double-end.`);
} finally { await vite.close(); }
