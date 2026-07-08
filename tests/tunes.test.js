import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, TUPLAUS, ATTRACT, winMelody, countUp, TUPLAUS_MAX_RATE } from '../src/audio/tunes.js';

test('N is 440-based equal temperament', () => {
  assert.ok(Math.abs(N(0) - 440) < 1e-9);
  assert.ok(Math.abs(N(12) - 880) < 1e-9);
  assert.ok(Math.abs(N(-9) - 261.63) < 0.01); // middle C
});

test('tuplaus is the 30-note phrase x3 plus the 9-note ending', () => {
  assert.equal(TUPLAUS.length, 99);
  assert.ok(Math.abs(TUPLAUS[0].freq - 349.23) < 0.5);   // opens on F4
  assert.ok(Math.abs(TUPLAUS[98].freq - 261.63) < 0.5);  // ends on C4
  assert.ok(TUPLAUS.every(n => n.type === 'square'));
  assert.ok(Math.abs(TUPLAUS[0].dur - 0.56) < 0.001);
  // Final note is held three beats.
  assert.ok(Math.abs(TUPLAUS[98].dur - 1.68) < 0.001);
});

test('attract jingle loops on the same melody as before', () => {
  assert.equal(ATTRACT.length, 9);
  assert.ok(ATTRACT.every(n => n.type === 'square'));
  assert.equal(ATTRACT.filter(n => n.freq === 0).length, 2); // two rests
});

test('winMelody scales with rank and caps at 9 steps', () => {
  assert.equal(winMelody(1).length, 4);
  assert.equal(winMelody(9).length, 9);
  const m = winMelody(3);
  assert.ok(m[1].freq > m[0].freq, 'melody must climb');
});

test('countUp caps long wins', () => {
  assert.equal(countUp(0).length, 1);
  assert.equal(countUp(8).length, 8);
  assert.equal(countUp(200).length, 40);
});

test('rate cap keeps the fastest tuplaus at the old 0.12s floor', () => {
  assert.ok(0.56 / TUPLAUS_MAX_RATE >= 0.12 - 1e-9);
});
