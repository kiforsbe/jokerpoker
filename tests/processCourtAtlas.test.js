import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { COURT_ART_LEVELS, COURT_RANKS, getCourtArtSpec } from '../src/rendering/cardArt/courtArtManifest.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('court atlas processor reproducibly builds manifest assets with exact rotational mirrors', async () => {
  const build = () => spawnSync(process.execPath, ['scripts/process-court-atlas.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });

  const firstRun = build();
  assert.equal(firstRun.status, 0, firstRun.stderr);
  const firstAssets = new Map();
  for (const level of COURT_ART_LEVELS) {
    for (const rank of COURT_RANKS) {
      const spec = getCourtArtSpec(level, rank);
      firstAssets.set(spec.url.href, await readFile(fileURLToPath(spec.url)));
    }
  }

  const secondRun = build();
  assert.equal(secondRun.status, 0, secondRun.stderr);

  for (const level of COURT_ART_LEVELS) {
    for (const rank of COURT_RANKS) {
      const spec = getCourtArtSpec(level, rank);
      const second = await readFile(fileURLToPath(spec.url));
      assert.deepEqual(second, firstAssets.get(spec.url.href), `${level} ${rank} changed across deterministic builds`);
      const png = PNG.sync.read(second);
      for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          const source = (y * png.width + x) * 4;
          const mirror = ((png.height - 1 - y) * png.width + (png.width - 1 - x)) * 4;
          assert.deepEqual(
            [...png.data.subarray(source, source + 4)],
            [...png.data.subarray(mirror, mirror + 4)],
            `${level} ${rank} differs at ${x},${y}`,
          );
        }
      }
    }
  }
});
