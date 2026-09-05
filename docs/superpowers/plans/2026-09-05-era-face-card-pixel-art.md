# Era-Specific Pixel Court Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the green card-edge debug effect with the intended neutral card border and ship native, mirrored, non-antialiased Jack, Queen, and King pixel art for the 1980s, 1990s, and early-2000s display profiles.

**Architecture:** A static manifest maps each `cardArtLevel` and court rank to a native PNG and its exact dimensions. A preload/cache module decodes all nine images before scene creation; synchronous card drawing uses the cached sprite with nearest-neighbour canvas sampling and falls back to the existing procedural renderer if an asset failed. A reproducible atlas-processing script enforces exact mirroring, binary alpha, fixed palette limits, and target sizes.

**Tech Stack:** JavaScript ES modules, Canvas 2D, Three.js, Node's test runner, `pngjs` 7.x for deterministic PNG processing/validation, built-in image generation, Playwright browser QA.

**Spec:** `docs/superpowers/specs/2026-09-05-era-face-card-pixel-art-design.md`

## Global Constraints

- Runtime sprite sizes are exactly 30 x 56 px for `eighties`, 60 x 112 px for `nineties`, and 120 x 224 px for `early2000s`.
- Runtime art contains one distinct native PNG per J/Q/K and era; no runtime path resizes one era's asset into another era's asset.
- Final PNG alpha values are only 0 or 255.
- Palette limits are 16 opaque colors for `eighties`, 32 for `nineties`, and 64 for `early2000s`.
- Every court-sprite `drawImage` call is preceded by `ctx.imageSmoothingEnabled = false` in the same saved canvas state.
- Generated figures contain no rank letters, suit glyphs, card border, paper background, or typography. Existing code continues to draw rank/suit indices and court suit marks.
- J/Q/K identity, pose, costume, and exact two-way mirroring remain consistent across eras; only pixel density, palette, shading, and ornament increase.
- The green depth-outline pass is disabled during normal startup and remains available through the existing `Alt+O` debug control.
- Joker, card-back, number-card, animation, sound, layout, CRT presets, and the clean early-2000s presentation path do not change.

## File structure

- Create `src/rendering/cardArt/courtArtManifest.js`: immutable level/rank-to-URL metadata and validation.
- Create `src/rendering/cardArt/courtArtAssets.js`: browser image decoding, cache, preload report, and synchronous lookup.
- Create `src/rendering/cardArt/drawCourtSprite.js`: nearest-neighbour sprite drawing and code-rendered mirrored suit marks.
- Create `src/assets/preloadPresentationAssets.js`: coordinate court preload and non-fatal font preload before scene creation.
- Create `scripts/process-court-atlas.mjs`: crop the 3-by-3 generated atlas, enforce mirroring/alpha/palettes, and write nine native PNGs.
- Create `tests/courtArtAssets.test.js`: manifest, PNG conformance, cache, and failure behavior.
- Create `tests/presentationAssets.test.js`: boot preload ordering and non-fatal failure reporting.
- Modify `src/rendering/cardArt/cardArt.js`: select cached court sprites and retain procedural fallback.
- Modify `src/rendering/CardRenderComponent.js`: continue passing existing rank/suit data through the revised court-art dispatch.
- Modify `src/rendering/RenderComponent.js`: honor a texture's explicit sampling override during direct redraws.
- Modify `src/rendering/TextureRasterizer.js`: preserve an explicit nearest texture-filter override for card canvases in every profile.
- Modify `src/rendering/RenderSystem.js`: default and persist outline state as disabled.
- Modify `src/game/GameScene.js`: explicitly request disabled outline configuration at normal scene startup.
- Modify `src/index.js`: await presentation assets before constructing `GameScene`.
- Modify `tests/cardArt.test.js`: cover sprite dispatch, nearest drawing, overlay ordering, and fallback.
- Modify `tests/textureRasterizer.test.js`: prove the per-texture nearest override survives an early-2000s profile redraw.
- Modify `tests/renderSystemProfile.test.js`: cover default-off and rebuild-safe outline state.
- Modify `package.json` and `package-lock.json`: add the pinned `pngjs` development dependency and the asset-processing script.
- Create `assets/cards/courts/source/court-atlas.png` and nine profile/rank PNGs under `assets/cards/courts/`.

---

### Task 1: Make the green outline opt-in debug behavior

**Files:**
- Modify: `src/rendering/RenderSystem.js:40-80,486-496,599-617`
- Modify: `src/game/GameScene.js:46-53`
- Modify: `tests/renderSystemProfile.test.js`

**Interfaces:**
- Consumes: existing `RenderSystem.toggleOutlineEffect(forceState?: boolean): void` and `setOutlineParameters(params: object): void`.
- Produces: `useOutlineEffect === shaderParams.outline.enabled === outlinePass.enabled`, with all three false by default and synchronized after debug toggles.

- [ ] **Step 1: Write the failing outline-state tests**

Add these cases to `tests/renderSystemProfile.test.js`:

```js
test('depth outline is disabled by default', () => {
  const system = new RenderSystem({ systems: new Map() });

  assert.equal(system.useOutlineEffect, false);
  assert.equal(system.shaderParams.outline.enabled, false);
});

test('outline debug toggle persists its state for pass rebuilds', () => {
  const system = new RenderSystem({ systems: new Map() });
  system.outlinePass = { enabled: false };

  system.toggleOutlineEffect(true);

  assert.equal(system.useOutlineEffect, true);
  assert.equal(system.shaderParams.outline.enabled, true);
  assert.equal(system.outlinePass.enabled, true);

  system.outlinePass = { enabled: system.shaderParams.outline.enabled };
  assert.equal(system.outlinePass.enabled, true);

  system.toggleOutlineEffect(false);
  assert.equal(system.useOutlineEffect, false);
  assert.equal(system.shaderParams.outline.enabled, false);
  assert.equal(system.outlinePass.enabled, false);
});
```

- [ ] **Step 2: Run the focused tests and verify the default-off assertion fails**

Run: `node --test tests/renderSystemProfile.test.js`

Expected: FAIL because `useOutlineEffect` and `shaderParams.outline.enabled` currently start as `true`.

- [ ] **Step 3: Synchronize default, parameter, and toggle state**

In `RenderSystem` set both constructor defaults to false, persist parameter changes even before a shader pass exists, and keep the debug toggle's stored value synchronized:

```js
this.useOutlineEffect = false;

// shaderParams.outline
enabled: false,
```

```js
setOutlineParameters(params = {}) {
  const { color, ...scalarParams } = params;
  Object.assign(this.shaderParams.outline, scalarParams);
  if (color !== undefined) this.shaderParams.outline.color.set(color);
  if ('enabled' in params) this.useOutlineEffect = !!params.enabled;
  if (!this.outlinePass) return;

  const uniforms = this.outlinePass.uniforms;
  if (color !== undefined) uniforms.outlineColor.value.copy(this.shaderParams.outline.color);
  if ('thickness' in params) uniforms.outlineThickness.value = params.thickness;
  if ('depthSensitivity' in params) uniforms.depthSensitivity.value = params.depthSensitivity;
  if ('enabled' in params) this.outlinePass.enabled = !!params.enabled;
}
```

```js
toggleOutlineEffect(forceState) {
  const newState = forceState === undefined ? !this.useOutlineEffect : !!forceState;
  if (newState && this.isDirectFallback) return;
  if (newState === this.useOutlineEffect) return;

  this.useOutlineEffect = newState;
  this.shaderParams.outline.enabled = newState;
  if (this.outlinePass) this.outlinePass.enabled = newState;
}
```

Only add the `shaderParams.outline.enabled` assignment to the existing toggle method; retain its current logger call and conditional `toggleComposer(true)` block immediately after the state assignments.

Add `enabled: false` to `GameScene.initialize()`'s existing outline settings:

```js
renderSystem.setOutlineParameters({
  enabled: false,
  color: 0x00ff00,
  thickness: 1.5,
  depthSensitivity: 0.05,
});
```

- [ ] **Step 4: Run the focused tests and the diff check**

Run: `node --test tests/renderSystemProfile.test.js`

Expected: PASS, including the direct-fallback and early-2000s tests.

Run: `git diff --check`

Expected: exit 0, allowing only the repository's existing line-ending warnings.

- [ ] **Step 5: Commit the outline fix**

```bash
git add src/rendering/RenderSystem.js src/game/GameScene.js tests/renderSystemProfile.test.js
git commit -m "fix: disable card depth outlines by default"
```

### Task 2: Generate and deterministically build the native court sprites

**Files:**
- Create: `src/rendering/cardArt/courtArtManifest.js`
- Create: `scripts/process-court-atlas.mjs`
- Create: `tests/courtArtAssets.test.js`
- Create: `assets/cards/courts/source/court-atlas.png`
- Create: `assets/cards/courts/eighties/K.png`, `Q.png`, `J.png`
- Create: `assets/cards/courts/nineties/K.png`, `Q.png`, `J.png`
- Create: `assets/cards/courts/early2000s/K.png`, `Q.png`, `J.png`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `COURT_ART_MANIFEST`, `COURT_ART_LEVELS`, `COURT_RANKS`, and `getCourtArtSpec(level, rank)`.
- Produces: nine exact-size, binary-alpha, palette-limited native PNG files consumed by Task 3.

- [ ] **Step 1: Add the pinned PNG tooling dependency and build command**

Run: `npm install --save-dev pngjs@7.0.0`

Add this script to `package.json`:

```json
"art:courts": "node scripts/process-court-atlas.mjs"
```

Expected: `package.json` and `package-lock.json` record exactly `pngjs` 7.x as a development dependency.

- [ ] **Step 2: Write the failing manifest and PNG-conformance tests**

Create `tests/courtArtAssets.test.js` with manifest-bound checks rather than duplicated filenames:

```js
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
```

- [ ] **Step 3: Run the asset test and verify it fails because the manifest or PNGs do not exist**

Run: `node --test tests/courtArtAssets.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `courtArtManifest.js`.

- [ ] **Step 4: Implement the immutable manifest**

Create `src/rendering/cardArt/courtArtManifest.js`:

```js
export const COURT_ART_LEVELS = Object.freeze(['coarse-pixel', 'detailed-pixel', 'high-detail']);
export const COURT_RANKS = Object.freeze(['K', 'Q', 'J']);

const LEVEL_SPECS = {
  'coarse-pixel': { directory: 'eighties', width: 30, height: 56, paletteLimit: 16 },
  'detailed-pixel': { directory: 'nineties', width: 60, height: 112, paletteLimit: 32 },
  'high-detail': { directory: 'early2000s', width: 120, height: 224, paletteLimit: 64 },
};

export const COURT_ART_MANIFEST = Object.freeze(Object.fromEntries(
  COURT_ART_LEVELS.map(level => [level, Object.freeze(Object.fromEntries(
    COURT_RANKS.map(rank => {
      const spec = LEVEL_SPECS[level];
      return [rank, Object.freeze({
        width: spec.width,
        height: spec.height,
        paletteLimit: spec.paletteLimit,
        url: new URL(`../../../assets/cards/courts/${spec.directory}/${rank}.png`, import.meta.url),
      })];
    }),
  ))]),
));

export function getCourtArtSpec(level, rank) {
  if (!Object.hasOwn(COURT_ART_MANIFEST, level)) {
    throw new TypeError(`Unknown court art level: ${level}`);
  }
  if (!Object.hasOwn(COURT_ART_MANIFEST[level], rank)) {
    throw new TypeError(`Unknown court rank: ${rank}`);
  }
  return COURT_ART_MANIFEST[level][rank];
}
```

Run: `node --test tests/courtArtAssets.test.js`

Expected: manifest tests PASS and PNG tests FAIL with `ENOENT`.

- [ ] **Step 5: Generate the source atlas with the built-in image-generation tool**

Generate one transparent portrait atlas using this prompt, preserving the generated file as `assets/cards/courts/source/court-atlas.png`:

```text
Create a production sprite-source atlas for a retro video-poker game. Transparent background. Exact 3 columns by 3 rows, generous transparent gutters, no grid lines, no labels, no text, no rank letters, no suit symbols, no card rectangles, no drop shadows.

Columns from left to right: KING, QUEEN, JACK. Rows from top to bottom: 1980s coarse arcade pixel art, 1990s detailed arcade pixel art, early-2000s high-detail pixel art.

Every cell shows a traditional two-way playing-card court figure: upright top half joined at the waist to an exact 180-degree mirrored bottom half. The King, Queen, and Jack must retain the same face, pose, silhouette, costume, colors, and identifying ornaments in all three rows. Only resolution, number of pixel clusters, palette richness, shading, and ornamental detail increase between rows.

Strong Finnish/European video-poker machine aesthetic. Crisp deliberately placed square pixels, hard edges, limited flat palettes, no antialiasing, no blur, no smooth vector edges, no painterly texture, no gradients, no photorealism. Make the 1980s row exceptionally chunky and readable, the 1990s row moderately detailed, and the early-2000s row richly detailed but unmistakably pixel art. Keep every figure centered and fully contained inside its cell with transparent space around it.
```

Inspect the atlas at original resolution. If identities drift, cells overlap, background is opaque, or any figure is not a clean mirrored court composition, edit the same generated atlas with one targeted correction at a time until all nine cells satisfy the prompt.

- [ ] **Step 6: Implement deterministic atlas processing**

Create `scripts/process-court-atlas.mjs` using `PNG.sync.read/write`. The script must:

```js
const ROWS = [
  { level: 'coarse-pixel', ranks: ['K', 'Q', 'J'] },
  { level: 'detailed-pixel', ranks: ['K', 'Q', 'J'] },
  { level: 'high-detail', ranks: ['K', 'Q', 'J'] },
];
```

For each equally sized atlas cell, perform these exact operations:

1. Scan alpha values to find the nontransparent bounding box; reject an empty cell.
2. Take only the top half through the center seam, so the output can enforce an exact two-way mirror.
3. Fit that half into `(targetWidth - 2) x (targetHeight / 2)` using nearest-neighbour source selection `source[Math.floor(destination * sourceSize / destinationSize)]`, centered with a one-pixel transparent horizontal margin.
4. Copy the top output half into the bottom half with `dst(x, height - 1 - y) = src(width - 1 - x, y)`.
5. Set alpha below 128 to 0 and alpha at or above 128 to 255.
6. Build an opaque palette by bucketing each RGB channel to its upper four bits, sorting buckets by descending frequency and then numeric RGB for deterministic ties, and retaining `paletteLimit` entries.
7. Replace each opaque pixel with the nearest retained RGB color by squared Euclidean distance; resolve equal distances by the palette order.
8. Write to `fileURLToPath(getCourtArtSpec(level, rank).url)` after creating its directory recursively.
9. Re-read each output and throw unless dimensions, binary alpha, mirror equality, and palette size all match the manifest.

The command must accept an optional first argument for the atlas and default to the committed source path:

```js
const atlasPath = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../assets/cards/courts/source/court-atlas.png', import.meta.url));
```

- [ ] **Step 7: Build and validate all nine native sprites**

Run: `npm run art:courts`

Expected: the script prints nine lines containing the output path, exact dimensions, and palette count, then exits 0.

Run: `node --test tests/courtArtAssets.test.js`

Expected: all manifest and PNG conformance tests PASS.

Inspect each PNG enlarged with nearest-neighbour display. If a silhouette, face, center seam, or ornament is unreadable, correct the corresponding atlas cell with image editing and rerun `npm run art:courts`; do not paint over the final PNG because the build must stay reproducible.

- [ ] **Step 8: Commit the generated source, native outputs, processor, and conformance tests**

```bash
git add package.json package-lock.json scripts/process-court-atlas.mjs tests/courtArtAssets.test.js src/rendering/cardArt/courtArtManifest.js assets/cards/courts
git commit -m "feat: add native era court sprites"
```

### Task 3: Preload and cache court sprites without making art failures fatal

**Files:**
- Create: `src/rendering/cardArt/courtArtAssets.js`
- Modify: `tests/courtArtAssets.test.js`

**Interfaces:**
- Consumes: `getCourtArtSpec(level, rank)` and the manifest arrays from Task 2.
- Produces: `preloadCourtArt({ loadImage? } = {}): Promise<{ loaded: number, failed: Array<{ level, rank, error }> }>`.
- Produces: `getCourtArtImage(level, rank): CanvasImageSource | null` and `clearCourtArtCache(): void`.

- [ ] **Step 1: Write failing preload/cache tests**

Append to `tests/courtArtAssets.test.js`:

```js
import {
  clearCourtArtCache,
  getCourtArtImage,
  preloadCourtArt,
} from '../src/rendering/cardArt/courtArtAssets.js';

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
```

- [ ] **Step 2: Run the focused tests and verify the loader import fails**

Run: `node --test tests/courtArtAssets.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `courtArtAssets.js`.

- [ ] **Step 3: Implement browser decoding and the success-only cache**

Create `src/rendering/cardArt/courtArtAssets.js` with this cache contract:

```js
import { COURT_ART_LEVELS, COURT_RANKS, getCourtArtSpec } from './courtArtManifest.js';

const cache = new Map();
const cacheKey = (level, rank) => `${level}:${rank}`;

async function loadBrowserImage(url) {
  if (typeof globalThis.Image !== 'function') throw new Error('Image decoding is unavailable');
  const image = new globalThis.Image();
  image.decoding = 'async';
  if (typeof image.decode === 'function') {
    image.src = url.href;
    await image.decode();
  } else {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Could not load ${url.href}`));
      image.src = url.href;
    });
  }
  return image;
}

export function clearCourtArtCache() {
  cache.clear();
}

export function getCourtArtImage(level, rank) {
  getCourtArtSpec(level, rank);
  return cache.get(cacheKey(level, rank)) ?? null;
}

export async function preloadCourtArt({ loadImage = loadBrowserImage } = {}) {
  const failed = [];
  let loaded = 0;
  for (const level of COURT_ART_LEVELS) {
    for (const rank of COURT_RANKS) {
      const spec = getCourtArtSpec(level, rank);
      try {
        const image = await loadImage(spec.url, spec);
        if (image.naturalWidth !== spec.width || image.naturalHeight !== spec.height) {
          throw new Error(`${level} ${rank} has invalid native size ${image.naturalWidth}x${image.naturalHeight}`);
        }
        cache.set(cacheKey(level, rank), image);
        loaded += 1;
      } catch (error) {
        cache.delete(cacheKey(level, rank));
        failed.push({ level, rank, error });
      }
    }
  }
  return { loaded, failed };
}
```

- [ ] **Step 4: Run the loader and full asset tests**

Run: `node --test tests/courtArtAssets.test.js`

Expected: all tests PASS, with failures represented in the report rather than rejected from `preloadCourtArt`.

- [ ] **Step 5: Commit the loader**

```bash
git add src/rendering/cardArt/courtArtAssets.js tests/courtArtAssets.test.js
git commit -m "feat: preload native court art"
```

### Task 4: Render cached sprites with nearest-neighbour sampling and procedural fallback

**Files:**
- Create: `src/rendering/cardArt/drawCourtSprite.js`
- Modify: `src/rendering/cardArt/cardArt.js:1-49`
- Modify: `src/rendering/CardRenderComponent.js:100-105`
- Modify: `src/rendering/RenderComponent.js:124-144`
- Modify: `src/rendering/RenderSystem.js:640-689`
- Modify: `src/rendering/TextureRasterizer.js:8-26,69-95`
- Modify: `tests/cardArt.test.js:1-60,110-126`
- Modify: `tests/textureRasterizer.test.js`

**Interfaces:**
- Consumes: `getCourtArtImage(level, rank)` from Task 3.
- Produces: `drawCourtSprite(ctx, bounds, image, suitColor, suitSymbol): void`.
- Preserves: `drawCourtArt(ctx, bounds, cardStyle, level, services?): void`, now preferring a cached image and using the existing `drawCourtMaster`/`pixelateIllustration` path only when lookup returns null.
- Produces: optional `sampling: 'nearest' | 'linear'` canvas-texture registration metadata; the card face supplies `'nearest'` so its pixel art remains nearest-filtered even in the clean early-2000s profile.

- [ ] **Step 1: Replace the old court-dispatch test with failing sprite and fallback tests**

In `tests/cardArt.test.js`, retain the joker tests and replace `court dispatch draws the master directly only at high detail` with:

```js
test('court dispatch selects the native sprite for level and rank', () => {
  const calls = [];
  const image = { id: 'nineties-queen' };
  const services = {
    getImage: (level, rank) => {
      calls.push(['lookup', level, rank]);
      return image;
    },
    drawSprite: (...args) => calls.push(['sprite', ...args.slice(2)]),
    drawMaster: () => calls.push(['master']),
    pixelate: () => calls.push(['pixelate']),
  };
  const bounds = { x: 4, y: 6, width: 100, height: 140 };
  const card = { rank: 'Q', suitColor: '#c81414', suitSymbol: '♥' };

  drawCourtArt({}, bounds, card, 'detailed-pixel', services);

  assert.deepEqual(calls, [
    ['lookup', 'detailed-pixel', 'Q'],
    ['sprite', image, '#c81414', '♥'],
  ]);
});

test('court dispatch retains the era-native procedural fallback', () => {
  const calls = [];
  const services = {
    getImage: () => null,
    drawMaster: (...args) => calls.push(['master', ...args.slice(2)]),
    pixelate: (...args) => calls.push(['pixelate', args.at(-1)]),
  };
  const bounds = { x: 4, y: 6, width: 100, height: 140 };
  const card = { rank: 'K', suitColor: '#1a1a1a', suitSymbol: '♣' };

  drawCourtArt({}, bounds, card, 'coarse-pixel', services);
  drawCourtArt({}, bounds, card, 'high-detail', services);

  assert.deepEqual(calls, [
    ['pixelate', { width: 30, height: 56, paletteSteps: 8 }],
    ['master', 'K', '#1a1a1a', '♣'],
  ]);
});
```

Add a direct drawing test for the no-smoothing invariant and mirrored suit marks:

```js
import { drawCourtSprite } from '../src/rendering/cardArt/drawCourtSprite.js';

test('court sprite draw disables smoothing and places both mirrored suit marks after the image', () => {
  const calls = [];
  const context = {
    imageSmoothingEnabled: true,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    drawImage(...args) { calls.push(['image', this.imageSmoothingEnabled, ...args]); },
    fillText: text => calls.push(['suit', text]),
    translate: () => calls.push('translate'),
    rotate: () => calls.push('rotate'),
  };

  drawCourtSprite(context, { x: 2, y: 3, width: 100, height: 140 }, { id: 'K' }, '#c81414', '♦');

  const imageCall = calls.find(call => Array.isArray(call) && call[0] === 'image');
  assert.equal(imageCall[1], false);
  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'suit'), [
    ['suit', '♦'],
    ['suit', '♦'],
  ]);
  assert.ok(calls.indexOf(imageCall) < calls.findIndex(call => Array.isArray(call) && call[0] === 'suit'));
});
```

Add this case to `tests/textureRasterizer.test.js`:

```js
test('a nearest sampling override survives high-detail profile redraw', () => {
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  const texture = fakeTexture();
  rasterizer.register({
    canvas: texture.image,
    texture,
    worldWidth: 1,
    sampling: 'nearest',
    draw: () => {},
  });

  rasterizer.applyDisplayProfile(DISPLAY_PROFILES.early2000s);

  assert.equal(texture.minFilter, 1003);
  assert.equal(texture.magFilter, 1003);
});
```

Add this case to `tests/renderSystemProfile.test.js` to cover the no-rasterizer redraw path:

```js
test('direct canvas texture redraw preserves an explicit nearest override', () => {
  const originalDocument = globalThis.document;
  const context = { canvas: null, clearRect() {} };
  const canvas = { width: 0, height: 0, getContext: () => context };
  context.canvas = canvas;
  globalThis.document = { createElement: () => canvas };
  try {
    const system = new RenderSystem({ systems: new Map() });
    system.activeDisplayProfile = DISPLAY_PROFILES.early2000s;
    const texture = system.createCanvasTexture(40, 20, () => {}, { sampling: 'nearest' });
    const component = new RenderComponent();
    component._renderSystem = system;

    component.updateTexture({ material: { map: texture } }, () => {});

    assert.equal(texture.minFilter, THREE.NearestFilter);
    assert.equal(texture.magFilter, THREE.NearestFilter);
  } finally {
    globalThis.document = originalDocument;
  }
});
```

- [ ] **Step 2: Run the card-art tests and verify the sprite path fails**

Run: `node --test tests/cardArt.test.js`

Expected: FAIL because `drawCourtSprite.js` does not exist and `drawCourtArt` has no cached-image branch.

- [ ] **Step 3: Implement the isolated nearest-neighbour sprite drawer**

Create `src/rendering/cardArt/drawCourtSprite.js`. Draw the image first, then reproduce the existing two suit positions at 39% and 61% of card height, rotating the bottom mark 180 degrees:

```js
export function drawCourtSprite(ctx, bounds, image, suitColor, suitSymbol) {
  const { x, y, width, height } = bounds;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = suitColor;
  ctx.font = `${Math.round(width * 0.20)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(suitSymbol, x + width * 0.5, y + height * 0.39);
  ctx.translate(x + width * 0.5, y + height * 0.61);
  ctx.rotate(Math.PI);
  ctx.fillText(suitSymbol, 0, 0);
  ctx.restore();
}
```

- [ ] **Step 4: Route `drawCourtArt` through the cache with the old renderer as fallback**

Add imports in `cardArt.js`:

```js
import { getCourtArtImage } from './courtArtAssets.js';
import { drawCourtSprite } from './drawCourtSprite.js';
```

Replace the court dispatch body with:

```js
export function drawCourtArt(ctx, bounds, cardStyle, level, services = {}) {
  const getImage = services.getImage ?? getCourtArtImage;
  const drawSprite = services.drawSprite ?? drawCourtSprite;
  const image = getImage(level, cardStyle.rank);
  if (image) {
    drawSprite(ctx, bounds, image, cardStyle.suitColor, cardStyle.suitSymbol);
    return;
  }

  const drawMaster = services.drawMaster ?? drawCourtMaster;
  const pixelate = services.pixelate ?? pixelateIllustration;
  const raster = getArtRaster(level);
  const draw = (target, targetBounds) => drawMaster(
    target,
    targetBounds,
    cardStyle.rank,
    cardStyle.suitColor,
    cardStyle.suitSymbol,
  );
  if (raster) pixelate(ctx, bounds, draw, raster);
  else draw(ctx, bounds);
}
```

No `CardRenderComponent.drawCard` geometry changes are needed: its existing call already supplies rank, suit color, suit symbol, and `cardArtLevel`, and it already draws corner indices after `drawCourtArt`.

- [ ] **Step 5: Preserve nearest GPU filtering for the card canvas in every era**

Extend `TextureRasterizer` registrations with an optional sampling override:

```js
function asRegistration(descriptor) {
  const sampling = descriptor.sampling;
  if (sampling !== undefined && sampling !== 'nearest' && sampling !== 'linear') {
    throw new TypeError('TextureRasterizer sampling must be nearest or linear');
  }
  return { label, canvas, texture, worldWidth, draw, nativeAspectRatio: aspect, sampling };
}
```

Insert the `sampling` validation after the existing positive-aspect validation; keep the existing declarations for `label`, `canvas`, `nativeWidth`, `nativeHeight`, and `aspect` intact, then replace only the function's return object with the one shown.

Use the override before the active profile default during redraw:

```js
const sampling = registration.sampling ?? this.profile.sampling.textures;
const filter = sampling === 'nearest' ? NEAREST_FILTER : LINEAR_FILTER;
texture.minFilter = texture.magFilter = filter;
```

In `RenderSystem.createCanvasTexture`, read `sampling` from `options`, pass it into `textureRasterizer.register`, and use it before the profile default on the non-rasterizer path:

```js
const { worldWidth, label, sampling } = options;
this.textureRasterizer.register({
  label,
  canvas,
  texture,
  nativeWidth: width,
  nativeHeight: height,
  worldWidth,
  sampling,
  draw: drawCallback,
});
```

After constructing the `CanvasTexture`, persist the override for redraws that do not use `TextureRasterizer`:

```js
texture.userData.sampling = sampling;
```

```js
const textureSampling = sampling ?? this.activeDisplayProfile?.sampling.textures ?? 'linear';
texture.minFilter = texture.magFilter = this._filterFor(textureSampling);
```

In `RenderComponent.updateTexture`, prefer the stored override before the active-profile setting:

```js
const sampling = texture.userData?.sampling
  ?? this._renderSystem?.activeDisplayProfile?.sampling.textures;
if (sampling) {
  const filter = sampling === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
  texture.minFilter = texture.magFilter = filter;
}
```

Set the card-face canvas override where `CardRenderComponent` creates it:

```js
{ worldWidth: this.CARD_WIDTH, label: 'Card', sampling: 'nearest' },
```

Do not apply this override to hold labels, UI text, or other textures.

- [ ] **Step 6: Run card-art, texture, and rendering tests**

Run: `node --test tests/cardArt.test.js tests/textureRasterizer.test.js tests/renderSystemProfile.test.js tests/displayProfiles.test.js`

Expected: all tests PASS. The existing `court card corner indices draw above the illustration` assertion remains green.

- [ ] **Step 7: Commit renderer integration**

```bash
git add src/rendering/cardArt/cardArt.js src/rendering/cardArt/drawCourtSprite.js src/rendering/CardRenderComponent.js src/rendering/RenderComponent.js src/rendering/RenderSystem.js src/rendering/TextureRasterizer.js tests/cardArt.test.js tests/textureRasterizer.test.js tests/renderSystemProfile.test.js
git commit -m "feat: render cached pixel court sprites"
```

### Task 5: Await court art before the first game scene

**Files:**
- Create: `src/assets/preloadPresentationAssets.js`
- Create: `tests/presentationAssets.test.js`
- Modify: `src/index.js:127-140`

**Interfaces:**
- Consumes: `preloadCourtArt()` from Task 3 and `document.fonts.load()`.
- Produces: `preloadPresentationAssets({ fonts?, preloadCourts?, logger? } = {}): Promise<{ loaded, failed }>`.
- Guarantees: `GameScene` construction occurs only after court preload resolves; font and court failures are logged and remain non-fatal.

- [ ] **Step 1: Write the failing presentation-preload tests**

Create `tests/presentationAssets.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preloadPresentationAssets } from '../src/assets/preloadPresentationAssets.js';

test('presentation preload awaits fonts and court images', async () => {
  const calls = [];
  const report = { loaded: 9, failed: [] };
  const result = await preloadPresentationAssets({
    fonts: { load: async value => calls.push(['font', value]) },
    preloadCourts: async () => {
      calls.push(['courts']);
      return report;
    },
    logger: { log: (...args) => calls.push(['log', ...args]) },
  });

  assert.equal(result, report);
  assert.deepEqual(calls, [
    ['font', '32px "VT323"'],
    ['courts'],
  ]);
});

test('presentation preload logs failures without rejecting startup', async () => {
  const logs = [];
  const error = new Error('missing queen');
  const result = await preloadPresentationAssets({
    fonts: { load: async () => { throw new Error('font offline'); } },
    preloadCourts: async () => ({
      loaded: 8,
      failed: [{ level: 'coarse-pixel', rank: 'Q', error }],
    }),
    logger: { log: (...args) => logs.push(args) },
  });

  assert.equal(result.loaded, 8);
  assert.equal(result.failed.length, 1);
  assert.ok(logs.some(([level, message]) => level === 'WARN' && /font/i.test(message)));
  assert.ok(logs.some(([level, message]) => level === 'WARN' && /court/i.test(message)));
});
```

- [ ] **Step 2: Run the test and verify the coordinator import fails**

Run: `node --test tests/presentationAssets.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `preloadPresentationAssets.js`.

- [ ] **Step 3: Implement non-fatal coordinated preload**

Create `src/assets/preloadPresentationAssets.js`:

```js
import { preloadCourtArt } from '../rendering/cardArt/courtArtAssets.js';

export async function preloadPresentationAssets({
  fonts = globalThis.document?.fonts,
  preloadCourts = preloadCourtArt,
  logger = console,
} = {}) {
  if (fonts?.load) {
    try {
      await fonts.load('32px "VT323"');
    } catch (error) {
      logger.log('WARN', 'Presentation font preload failed; using fallback', { error: error.message });
    }
  }

  const report = await preloadCourts();
  for (const failure of report.failed) {
    logger.log('WARN', 'Court art preload failed; using procedural fallback', {
      level: failure.level,
      rank: failure.rank,
      error: failure.error.message,
    });
  }
  return report;
}
```

- [ ] **Step 4: Call the coordinator before `GameScene` construction**

In `src/index.js`, import the helper and replace the inline font-only block at the start of `loadGame()`:

```js
import { preloadPresentationAssets } from './assets/preloadPresentationAssets.js';
```

```js
async loadGame() {
  try {
    await preloadPresentationAssets({ logger: this.logger });

    this.gameScene = new GameScene();
    await this.engine.setScene(this.gameScene);
```

Replace only the inline font-loading block at `src/index.js:128-134`; keep the existing input enable, logging, and intro fade statements that follow scene setup. This placement guarantees that the first call to `CardRenderComponent.drawCard` sees either a decoded native sprite or a known failed cache entry and procedural fallback.

- [ ] **Step 5: Run startup and related unit tests**

Run: `node --test tests/presentationAssets.test.js tests/courtArtAssets.test.js tests/cardArt.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Commit boot integration**

```bash
git add src/assets/preloadPresentationAssets.js src/index.js tests/presentationAssets.test.js
git commit -m "feat: preload court art before scene creation"
```

### Task 6: Full verification and three-era visual QA

**Files:**
- Verify: all files changed in Tasks 1-5
- Optional local QA captures: `artifacts/court-qa/eighties.png`, `nineties.png`, `early2000s.png` (do not commit unless the repository already tracks QA captures)

**Interfaces:**
- Consumes: completed outline, asset, loader, render, and startup changes.
- Produces: evidence that all automated and visual requirements hold together in the running game.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: every test passes with zero failures, including manifest/PNG conformance, outline state, card rendering, CRT profile behavior, audio, and texture rasterization.

- [ ] **Step 2: Run both build modes**

Run: `npm run build:local`

Expected: exit 0 and successful local bundle output.

Run: `npm run build:vendored`

Expected: exit 0 and successful vendored bundle output with all nine PNG URLs resolvable from the built page.

- [ ] **Step 3: Start the game and capture the same court ranks in every era**

Start or reuse the local server at `http://127.0.0.1:5501/src/index.html`. Using the Playwright interactive browser workflow:

1. Enter the game and ensure at least one Jack, Queen, and King is visible; use the game's existing debug/deal controls if needed.
2. Capture 1980s, 1990s, and early-2000s at the same viewport and game state.
3. Inspect the screenshots at 100% and nearest-neighbour zoom.

Expected visual evidence:

- no green rectangle appears around any card during normal play;
- `Alt+O` visibly adds the green outline and a second `Alt+O` removes it;
- the same J/Q/K identities, poses, costumes, and two-way mirror appear in all three profiles;
- 1980s pixels are deliberately chunky, 1990s pixels are finer, and early-2000s pixels are richest without smooth/vector edges;
- no semitransparent halo or bilinear blur surrounds any court figure;
- rank/suit corner indices remain above the art and court suit symbols match the dealt suit;
- CRT curvature/scanlines remain present only in 1980s and 1990s;
- early-2000s remains saturated, clean, and entirely CRT-free.

- [ ] **Step 4: Exercise the failure fallback once in the browser**

Temporarily change one manifest URL in browser devtools or block one court PNG request, reload, and deal the matching rank.

Expected: startup completes, a warning identifies the failed level/rank, and the old procedural court figure renders for that one asset. Revert the temporary browser-only override before continuing.

- [ ] **Step 5: Run final repository checks**

Run: `git diff --check`

Expected: exit 0, allowing only known line-ending warnings.

Run: `git status --short`

Expected: no uncommitted implementation files or generated outputs remain.

- [ ] **Step 6: Record any final QA-only correction as its own commit**

If visual QA required a targeted atlas edit, rebuild all sprites, rerun `npm test`, and commit only the corrected source/output assets:

```bash
git add assets/cards/courts/source/court-atlas.png assets/cards/courts/eighties assets/cards/courts/nineties assets/cards/courts/early2000s
git commit -m "fix: refine pixel court artwork"
```

If no correction was necessary, do not create an empty commit.
