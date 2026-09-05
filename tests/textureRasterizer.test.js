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
  return {
    image: canvas,
    minFilter: null,
    magFilter: null,
    needsUpdate: false,
    disposeCalls: 0,
    dispose() { this.disposeCalls++; },
  };
}

test('sizes registered textures from world width at every display density', () => {
  for (const [id, expected] of [['eighties', [240, 120]], ['nineties', [300, 150]], ['early2000s', [384, 192]]]) {
    const texture = fakeTexture();
    const rasterizer = new TextureRasterizer(DISPLAY_PROFILES[id]);
    const handle = rasterizer.register({ label: id, canvas: texture.image, texture, nativeWidth: 40, nativeHeight: 20, worldWidth: 1, draw: () => {} });
    assert.equal(texture.userData.rasterHandle, handle);
    assert.deepEqual([handle.canvas.width, handle.canvas.height], expected, id);
  }
});

test('redraw clears before drawing, applies sampling, and marks texture dirty', () => {
  const texture = fakeTexture();
  let draws = 0;
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  const handle = rasterizer.register({ canvas: texture.image, texture, nativeWidth: 40, nativeHeight: 20, worldWidth: 0.5, draw: () => { draws++; } });
  assert.equal(draws, 1);
  assert.equal(texture.minFilter, 1003);
  assert.equal(texture.magFilter, 1003);
  assert.equal(texture.needsUpdate, true);
  texture.needsUpdate = false;
  assert.equal(rasterizer.redraw(handle), true);
  assert.equal(draws, 2);
  assert.equal(texture.needsUpdate, true);
  assert.deepEqual(texture.image.calls[0], ['clearRect', 0, 0, 120, 60]);
});

test('redraw uses a replacement draw callback on the mutable handle', () => {
  const texture = fakeTexture();
  const calls = [];
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  const handle = rasterizer.register({ canvas: texture.image, texture, worldWidth: 1, draw: () => calls.push('initial') });
  handle.draw = () => calls.push('replacement');
  rasterizer.redraw(handle);
  assert.deepEqual(calls, ['initial', 'replacement']);
});

test('applyDisplayProfile resizes and redraws all registered textures', () => {
  const first = fakeTexture();
  const second = fakeTexture(fakeCanvas(20, 40));
  let draws = 0;
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  rasterizer.register({ canvas: first.image, texture: first, nativeWidth: 40, nativeHeight: 20, worldWidth: 1, draw: () => { draws++; } });
  rasterizer.register({ canvas: second.image, texture: second, nativeWidth: 20, nativeHeight: 40, worldWidth: 0.25, draw: () => { draws++; } });
  rasterizer.applyDisplayProfile(DISPLAY_PROFILES.nineties);
  assert.deepEqual([first.image.width, first.image.height], [300, 150]);
  assert.deepEqual([second.image.width, second.image.height], [75, 150]);
  assert.equal(draws, 4);
});

test('nearest sampling registration stays nearest when the profile uses linear textures', () => {
  const texture = fakeTexture();
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
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

test('rejects unknown texture sampling registrations', () => {
  const texture = fakeTexture();
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);

  assert.throws(
    () => rasterizer.register({ canvas: texture.image, texture, worldWidth: 1, sampling: 'bicubic', draw: () => {} }),
    /sampling must be nearest or linear/,
  );
});

test('resizing a canvas texture releases its old GPU allocation before upload', () => {
  const texture = fakeTexture(fakeCanvas(240, 120));
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  rasterizer.register({ canvas: texture.image, texture, nativeWidth: 40, nativeHeight: 20, worldWidth: 1, draw: () => {} });
  assert.equal(texture.disposeCalls, 0);

  rasterizer.redraw();
  assert.equal(texture.disposeCalls, 0);

  rasterizer.applyDisplayProfile(DISPLAY_PROFILES.nineties);
  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual([texture.image.width, texture.image.height], [300, 150]);
  assert.equal(texture.needsUpdate, true);
});

test('unregister is idempotent and prevents later redraws', () => {
  const texture = fakeTexture();
  let draws = 0;
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
  const handle = rasterizer.register({ canvas: texture.image, texture, worldWidth: 1, draw: () => { draws++; } });
  assert.equal(rasterizer.unregister(handle), true);
  assert.equal(rasterizer.unregister(handle), false);
  assert.equal(rasterizer.redraw(handle), false);
  assert.equal(texture.userData?.rasterHandle, undefined);
  assert.equal(draws, 1);
});

test('draw failures leave a visible error texture and notify the owner', () => {
  const texture = fakeTexture();
  const errors = [];
  const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties, {
    onDrawError: (error, handle) => errors.push([error, handle]),
  });
  const handle = rasterizer.register({ label: 'joker', canvas: texture.image, texture, worldWidth: 1, draw: () => { throw new Error('bad art'); } });
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0].message, 'bad art');
  assert.equal(errors[0][1], handle);
  assert.equal(errors[0][1].label, 'joker');
  assert.ok(texture.image.calls.some(call => call[0] === 'fillRect'));
  assert.ok(texture.image.calls.some(call => call[0] === 'fillText'));
  assert.equal(texture.needsUpdate, true);
});
