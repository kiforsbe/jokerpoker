import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformHtml } from '../scripts/htmlTransform.mjs';

// The real index.html is the fixture, so these tests double as drift
// detectors: editing index.html in a way that breaks the offline builds
// fails the suite, not just the build.
const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

test('both modes strip Google Fonts and inject the local font-face', () => {
  for (const mode of ['local', 'vendored']) {
    const out = transformHtml(html, mode);
    assert.ok(!out.includes('fonts.googleapis.com'), `${mode}: googleapis leaked`);
    assert.ok(!out.includes('fonts.gstatic.com'), `${mode}: gstatic leaked`);
    assert.ok(out.includes("url('fonts/VT323-Regular.ttf') format('truetype')"), `${mode}: no local font-face`);
  }
});

test('local mode is module-free: no import map, no shim, classic game.js script', () => {
  const out = transformHtml(html, 'local');
  assert.ok(!out.includes('importmap'));
  assert.ok(!out.includes('es-module-shims'));
  assert.ok(!out.includes('type="module"'));
  assert.ok(out.includes('<script src="game.js"></script>'));
});

test('vendored mode rewrites the import map to local paths and keeps modules', () => {
  const out = transformHtml(html, 'vendored');
  assert.ok(out.includes('"three": "./vendor/three/three.module.js"'));
  assert.ok(out.includes('"three/addons/": "./vendor/three/examples/jsm/"'));
  assert.ok(!out.includes('unpkg.com'), 'CDN URL leaked into vendored build');
  assert.ok(out.includes('<script type="module" src="index.js"></script>'));
  assert.ok(out.includes('vendor/es-module-shims/es-module-shims.js'));
});

test('a missing marker fails the build loudly', () => {
  assert.throws(() => transformHtml('<html><head></head></html>', 'local'), /marker not found/);
  assert.throws(() => transformHtml(html, 'nope'), /unknown mode/);
});
