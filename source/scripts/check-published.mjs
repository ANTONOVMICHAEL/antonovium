import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(source, 'dist');
const published = resolve(source, '..');

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return children.flat();
}

const builtFiles = await files(dist);
assert.ok(builtFiles.some(path => relative(dist, path) === 'index.html'), 'Production build has no index.html');
for (const built of builtFiles) {
  const name = relative(dist, built);
  const [buildContent, publishedContent] = await Promise.all([
    readFile(built),
    readFile(resolve(published, name)).catch(() => null),
  ]);
  assert.ok(publishedContent, `Missing published file: ${name}`);
  assert.ok(buildContent.equals(publishedContent), `Published file differs from clean build: ${name}`);
}
console.log(`${builtFiles.length} published files match the production build byte for byte.`);
