import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_PROFILES } from '../src/rendering/displayProfiles.js';
import { TextureRasterizer } from '../src/rendering/TextureRasterizer.js';

function fakeCanvas(width = 40, height = 20) {
  const calls = [];
  const context = {
    canvas: null,
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    fillText: (...args) => calls.push(['fillText', ...args]),
    measureText: () => ({ actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
  };
  const canvas = {
    width, height,
    getContext: () => context,
    calls,
  };
  context.canvas = canvas;
  return canvas;
}

function fakeTexture(canvas = fakeCanvas()) {
  return { image: canvas, minFilter: null, magFilter: null, needsUpdate: false };
}

test('sizes registered textures from world width at every display density', () => {
  for (const [id, expected] of [['eighties', [240, 120]], ['nineties', [300, 150]], ['early2000s', [384, 192]]]) {
    const texture = fakeTexture();
    const rasterizer = new TextureRasterizer(DISPLAY_PROFILES[id]);
    rasterizer.register(texture, 1, () => {});
    assert.deepEqual([texture.image.width, texture.image.height], expected, id);
  }
});

test('redraw clears before drawing, applies sampling, and marks texture dirty', () => {
  const texture = fakeTexture();
  let draws = 0;
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  rasterizer.register(texture, { worldWidth: 0.5, drawCallback: () => { draws++; } });
  assert.equal(draws, 1);
  assert.equal(texture.minFilter, 1003);
  assert.equal(texture.magFilter, 1003);
  assert.equal(texture.needsUpdate, true);
  texture.needsUpdate = false;
  assert.equal(rasterizer.redraw(texture), true);
  assert.equal(draws, 2);
  assert.equal(texture.needsUpdate, true);
  assert.deepEqual(texture.image.calls[0], ['clearRect', 0, 0, 120, 60]);
});

test('applyDisplayProfile resizes and redraws all registered textures', () => {
  const first = fakeTexture();
  const second = fakeTexture(fakeCanvas(20, 40));
  let draws = 0;
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  rasterizer.register(first, 1, () => { draws++; });
  rasterizer.register(second, { worldWidth: 0.25, drawCallback: () => { draws++; } });
  rasterizer.applyDisplayProfile(DISPLAY_PROFILES.nineties);
  assert.deepEqual([first.image.width, first.image.height], [300, 150]);
  assert.deepEqual([second.image.width, second.image.height], [75, 150]);
  assert.equal(draws, 4);
});

test('unregister is idempotent and prevents later redraws', () => {
  const texture = fakeTexture();
  let draws = 0;
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  rasterizer.register(texture, 1, () => { draws++; });
  assert.equal(rasterizer.unregister(texture), true);
  assert.equal(rasterizer.unregister(texture), false);
  assert.equal(rasterizer.redraw(texture), false);
  assert.equal(draws, 1);
});

test('draw failures leave a visible error texture and notify the owner', () => {
  const texture = fakeTexture();
  const errors = [];
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties, {
    onDrawError: (error, registeredTexture) => errors.push([error, registeredTexture]),
  });
  rasterizer.register(texture, 1, () => { throw new Error('bad art'); });
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0].message, 'bad art');
  assert.equal(errors[0][1], texture);
  assert.ok(texture.image.calls.some(call => call[0] === 'fillRect'));
  assert.ok(texture.image.calls.some(call => call[0] === 'fillText'));
  assert.equal(texture.needsUpdate, true);
});
