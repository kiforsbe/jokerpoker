import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZZFX } from '../src/audio/vendor/zzfx.js';

test('buildSamples generates a bounded, non-silent sample array', () => {
  // A short 440 Hz square-ish blip: volume, randomness, frequency, attack,
  // sustain, release, shape (1 = triangle), shapeCurve (0 = squared off).
  const samples = ZZFX.buildSamples(1, 0, 440, .001, .02, .04, 1, 0);
  assert.ok(samples.length > 1000, `expected >1000 samples, got ${samples.length}`);
  assert.ok(samples.some(s => Math.abs(s) > 0.01), 'all samples were silent');
  assert.ok(samples.every(s => Number.isFinite(s) && Math.abs(s) <= 1), 'samples out of range');
});

test('module import creates no AudioContext', () => {
  assert.equal(ZZFX.audioContext, null);
});

test('sample rate is the ZzFX native 44100', () => {
  assert.equal(ZZFX.sampleRate, 44100);
});
