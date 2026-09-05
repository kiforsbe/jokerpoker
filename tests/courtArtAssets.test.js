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
import {
  clearCourtArtCache,
  getCourtArtImage,
  preloadCourtArt,
} from '../src/rendering/cardArt/courtArtAssets.js';

const EXPECTED = {
  'coarse-pixel': { width: 30, height: 56, paletteLimit: 16 },
  'detailed-pixel': { width: 60, height: 112, paletteLimit: 32 },
  'high-detail': { width: 120, height: 224, paletteLimit: 64 },
};

test('court source atlas has binary transparency and clear cell gutters', async () => {
  const source = PNG.sync.read(await readFile(fileURLToPath(
    new URL('../assets/cards/courts/source/court-atlas.png', import.meta.url),
  )));
  const gutter = 16;
  for (let row = 0; row < 3; row += 1) {
    const top = Math.floor(row * source.height / 3);
    const bottom = Math.floor((row + 1) * source.height / 3);
    for (let column = 0; column < 3; column += 1) {
      const left = Math.floor(column * source.width / 3);
      const right = Math.floor((column + 1) * source.width / 3);
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const alpha = source.data[(y * source.width + x) * 4 + 3];
          assert.ok(alpha === 0 || alpha === 255, `partial source alpha ${alpha} at ${x},${y}`);
          if (x < left + gutter || x >= right - gutter || y < top + gutter || y >= bottom - gutter) {
            assert.equal(alpha, 0, `source gutter is opaque at ${x},${y}`);
          }
        }
      }
    }
  }
});

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

test('court preload caches all successfully decoded images', async () => {
  clearCourtArtCache();
  const images = new Map();
  const report = await preloadCourtArt({
    loadImage: async (url, spec) => {
      const image = { src: url.href, naturalWidth: spec.width, naturalHeight: spec.height };
      images.set(url.href, image);
      return image;
    },
  });

  assert.deepEqual(report, { loaded: 9, failed: [] });
  assert.equal(getCourtArtImage('coarse-pixel', 'K'), images.get(getCourtArtSpec('coarse-pixel', 'K').url.href));
});

test('court preload reports one failure and leaves that sprite uncached', async () => {
  clearCourtArtCache();
  const report = await preloadCourtArt({
    loadImage: async (url, spec) => {
      if (url.href.endsWith('/Q.png')) throw new Error('decode failed');
      return { naturalWidth: spec.width, naturalHeight: spec.height };
    },
  });

  assert.equal(report.loaded, 6);
  assert.equal(report.failed.length, 3);
  assert.deepEqual(report.failed.map(item => item.rank), ['Q', 'Q', 'Q']);
  assert.equal(getCourtArtImage('coarse-pixel', 'Q'), null);
  assert.ok(getCourtArtImage('coarse-pixel', 'K'));
});

test('court preload rejects decoded images with the wrong native size', async () => {
  clearCourtArtCache();
  const report = await preloadCourtArt({
    loadImage: async () => ({ naturalWidth: 1, naturalHeight: 1 }),
  });

  assert.equal(report.loaded, 0);
  assert.equal(report.failed.length, 9);
  assert.match(report.failed[0].error.message, /native size/);
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
