import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISPLAY_PROFILE_ORDER,
  DISPLAY_PROFILES,
  LEGACY_PROFILE_IDS,
  SCREEN_ASPECT,
  getDisplayProfile,
  pixelsPerWorldUnit,
  validateDisplayProfile,
} from '../src/rendering/displayProfiles.js';

const ids = ['eighties', 'nineties', 'early2000s'];

test('defines the immutable 4:3 profile registry and exact framebuffers', () => {
  assert.equal(SCREEN_ASPECT, 4 / 3);
  assert.deepEqual(DISPLAY_PROFILE_ORDER, ids);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].framebuffer), [
    { width: 640, height: 480 },
    { width: 800, height: 600 },
    { width: 1024, height: 768 },
  ]);
  for (const id of ids) {
    assert.equal(DISPLAY_PROFILES[id].framebuffer.width / DISPLAY_PROFILES[id].framebuffer.height, SCREEN_ASPECT);
  }
});

test('profiles are recursively frozen and validate at module load', () => {
  const visit = (value) => {
    assert.equal(Object.isFrozen(value), true);
    if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(DISPLAY_PROFILES);
  visit(DISPLAY_PROFILE_ORDER);
  visit(LEGACY_PROFILE_IDS);
  ids.forEach((id) => assert.equal(validateDisplayProfile(DISPLAY_PROFILES[id]), true));
});

test('contains sampling, card-art, and CRT settings for each era', () => {
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].sampling), [
    { scene: 'nearest', textures: 'nearest', output: 'pixelated' },
    { scene: 'nearest', textures: 'nearest', output: 'pixelated' },
    { scene: 'linear', textures: 'linear', output: 'auto' },
  ]);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].cardArtLevel), ['coarse-pixel', 'detailed-pixel', 'high-detail']);
  assert.equal(DISPLAY_PROFILES.eighties.postProcessing.crt.enabled, true);
  assert.equal(DISPLAY_PROFILES.nineties.postProcessing.crt.enabled, true);
  assert.equal(DISPLAY_PROFILES.early2000s.postProcessing.crt.enabled, false);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].postProcessing.crt.scanlineDensity), [0.50, 0.60, 0]);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].postProcessing.crt.scanlineIntensity), [0.16, 0.08, 0]);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].postProcessing.crt.rgbShiftPixels), [1.50, 0.60, 0]);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].postProcessing.crt.noise), [0.025, 0.008, 0]);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].postProcessing.crt.flicker), [0.012, 0.003, 0]);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].postProcessing.crt.vignetteIntensity), [0.18, 0.08, 0]);
  assert.deepEqual(ids.map((id) => DISPLAY_PROFILES[id].postProcessing.crt.curvature), [{ x: 3.5, y: 3.5 }, { x: 7, y: 7 }, { x: 1000, y: 1000 }]);
  const eighties = DISPLAY_PROFILES.eighties.postProcessing.crt;
  const nineties = DISPLAY_PROFILES.nineties.postProcessing.crt;
  for (const key of ['scanlineIntensity', 'rgbShiftPixels', 'noise', 'flicker', 'vignetteIntensity']) {
    assert.ok(nineties[key] < eighties[key], `${key} should be cleaner in the 1990s`);
  }
  assert.deepEqual(DISPLAY_PROFILES.early2000s.postProcessing.crt, {
    enabled: false, scanlineDensity: 0, scanlineIntensity: 0, rgbShiftPixels: 0,
    noise: 0, flicker: 0, vignetteIntensity: 0, curvature: { x: 1000, y: 1000 },
  });
});

test('looks up profiles, maps legacy IDs, and calculates pixels per world unit', () => {
  assert.equal(getDisplayProfile('eighties'), DISPLAY_PROFILES.eighties);
  assert.equal(getDisplayProfile('unknown'), null);
  assert.deepEqual(LEGACY_PROFILE_IDS, { retro: 'eighties', medium: 'nineties', hires: 'early2000s' });
  assert.deepEqual(Object.entries(LEGACY_PROFILE_IDS).map(([legacy, id]) => getDisplayProfile(LEGACY_PROFILE_IDS[legacy]).label), ['1980s', '1990s', 'Early 2000s']);
  assert.deepEqual(ids.map((id) => pixelsPerWorldUnit(DISPLAY_PROFILES[id])), [240, 300, 384]);
});

test('rejects invalid dimensions and aspect ratios', () => {
  assert.throws(() => validateDisplayProfile({ framebuffer: { width: 0, height: 480 } }), /positive integers/);
  assert.throws(() => validateDisplayProfile({ framebuffer: { width: 640.5, height: 480 } }), /positive integers/);
  assert.throws(() => validateDisplayProfile({ framebuffer: { width: 640, height: 479 } }), /4:3/);
  assert.throws(() => pixelsPerWorldUnit({ framebuffer: { width: -1, height: 1 } }), /positive integers/);
});
