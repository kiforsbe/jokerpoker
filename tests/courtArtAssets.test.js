import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  COURT_ART_LEVELS,
  COURT_ART_MANIFEST,
  COURT_RANKS,
  getCourtArtSpec,
} from '../src/rendering/cardArt/courtArtManifest.js';

const EXPECTED = {
  'coarse-pixel': { width: 30, height: 56, paletteLimit: 16 },
  'detailed-pixel': { width: 60, height: 112, paletteLimit: 32 },
  'high-detail': { width: 120, height: 224, paletteLimit: 64 },
};

test('court manifest defines nine distinct native assets', () => {
  assert.deepEqual(COURT_ART_LEVELS, Object.keys(EXPECTED));
  assert.deepEqual(COURT_RANKS, ['K', 'Q', 'J']);
  const urls = [];
  for (const level of COURT_ART_LEVELS) {
    for (const rank of COURT_RANKS) {
      const spec = getCourtArtSpec(level, rank);
      assert.deepEqual(
        { width: spec.width, height: spec.height, paletteLimit: spec.paletteLimit },
        EXPECTED[level],
      );
      urls.push(spec.url.href);
    }
  }
  assert.equal(new Set(urls).size, 9);
  assert.equal(Object.isFrozen(COURT_ART_MANIFEST), true);
});

test('court asset lookup rejects unknown levels and ranks', () => {
  assert.throws(() => getCourtArtSpec('bogus', 'K'), /Unknown court art level/);
  assert.throws(() => getCourtArtSpec('coarse-pixel', 'A'), /Unknown court rank/);
});

for (const level of Object.keys(EXPECTED)) {
  for (const rank of ['K', 'Q', 'J']) {
    test(`${level} ${rank} is a native binary-alpha palette PNG`, async () => {
      const spec = getCourtArtSpec(level, rank);
      const png = PNG.sync.read(await readFile(fileURLToPath(spec.url)));
      assert.deepEqual([png.width, png.height], [spec.width, spec.height]);
      const colors = new Set();
      for (let offset = 0; offset < png.data.length; offset += 4) {
        const alpha = png.data[offset + 3];
        assert.ok(alpha === 0 || alpha === 255, `partial alpha ${alpha} at byte ${offset}`);
        if (alpha === 255) colors.add(`${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]}`);
      }
      assert.ok(colors.size <= spec.paletteLimit, `${colors.size} colors exceeds ${spec.paletteLimit}`);
    });
  }
}
