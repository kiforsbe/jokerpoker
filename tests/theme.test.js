import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTheme, setTheme, toggleTheme, onThemeChanged, textureFilter, PALETTE, LAYOUT } from '../src/rendering/theme.js';

test('default theme is retro', () => {
  setTheme('retro'); // reset in case test order changes state
  const t = getTheme();
  assert.equal(t.name, 'retro');
  assert.equal(t.retro, true);
  assert.equal(t.pixelCourts, true);
  assert.ok(t.scale > 0 && t.scale < 1);
  // Virtual 640x480 machine screen: the 4:3 world area is 8/3 x 2 units,
  // so 640 / (8/3) = 240 pixels per world unit.
  assert.equal(t.pixelsPerUnit, 240);
});

test('setTheme switches to hires and notifies listeners', () => {
  setTheme('retro');
  let seen = null;
  const off = onThemeChanged((t) => { seen = t.name; });
  const t = setTheme('hires');
  assert.equal(t.name, 'hires');
  assert.equal(t.retro, false);
  assert.equal(t.scale, 1);
  assert.equal(seen, 'hires');
  off();
});

test('setTheme ignores unknown names and no-ops on same name', () => {
  setTheme('hires');
  let calls = 0;
  const off = onThemeChanged(() => { calls++; });
  setTheme('bogus');
  setTheme('hires');
  assert.equal(getTheme().name, 'hires');
  assert.equal(calls, 0);
  off();
});

test('toggleTheme cycles resolutions: retro -> medium -> hires -> retro', () => {
  setTheme('retro');
  assert.equal(toggleTheme().name, 'medium');
  assert.equal(toggleTheme().name, 'hires');
  assert.equal(toggleTheme().name, 'retro');
});

test('medium is a pixelated theme on a denser 960x720 grid', () => {
  setTheme('medium');
  const t = getTheme();
  assert.equal(t.retro, true);
  assert.equal(t.pixelCourts, true);
  assert.equal(t.pixelsPerUnit, 360); // 960 / (8/3)
  assert.equal(textureFilter(), 1003); // still hard pixels
  assert.match(t.uiFont(32), /VT323/);
  setTheme('retro');
});

test('unsubscribe stops notifications', () => {
  setTheme('retro');
  let calls = 0;
  const off = onThemeChanged(() => { calls++; });
  off();
  setTheme('hires');
  assert.equal(calls, 0);
  setTheme('retro');
});

test('fonts and palette are provided', () => {
  setTheme('retro');
  assert.match(getTheme().uiFont(32), /VT323/);
  setTheme('hires');
  assert.match(getTheme().uiFont(32), /monospace/);
  assert.equal(PALETTE.field, '#2050c8');
  setTheme('retro');
});

test('LAYOUT bands are ordered within the ortho world (y in [-1, 1])', () => {
  // Top gray band ends below the status row; bottom band starts above the
  // screen bottom and contains the hold indicators.
  assert.ok(LAYOUT.topBandBottomY < 1 && LAYOUT.topBandBottomY > 0);
  assert.ok(LAYOUT.bottomBandTopY > -1 && LAYOUT.bottomBandTopY < 0);
  assert.ok(LAYOUT.holdY < LAYOUT.bottomBandTopY && LAYOUT.holdY > -1);
});

test('textureFilter is nearest in retro, linear in hires (three.js constants)', () => {
  setTheme('retro');
  assert.equal(textureFilter(), 1003); // THREE.NearestFilter
  setTheme('hires');
  assert.equal(textureFilter(), 1006); // THREE.LinearFilter
  setTheme('retro');
});

test('retro uiFont compensates for VT323 size and snaps to its 16px design grid', () => {
  setTheme('retro');
  // VT323 caps are ~22% shorter than bold monospace at equal px, so retro
  // scales requests by 1.35 — then snaps to a multiple of 16px, because
  // VT323's glyphs live on a 16-per-em pixel grid: only multiples of 16
  // give integer design pixels; anything else rasterizes with alternating
  // thick/thin strokes.
  assert.equal(getTheme().uiFont(22), '32px "VT323", monospace'); // 29.7 -> 32
  assert.equal(getTheme().uiFont(32), '48px "VT323", monospace'); // 43.2 -> 48
  // The 16px floor keeps the smallest requests readable.
  assert.equal(getTheme().uiFont(10), '16px "VT323", monospace');
  assert.equal(getTheme().uiFont(4), '16px "VT323", monospace');
  setTheme('hires');
  assert.equal(getTheme().uiFont(32), 'bold 32px monospace');
  setTheme('retro');
});
