import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, LAYOUT, uiFont, cardFont, fillTextCentered } from '../src/rendering/uiStyle.js';

test('shared UI style has one profile-independent palette and layout', () => {
  assert.equal(PALETTE.field, '#2050c8');
  assert.ok(LAYOUT.topBandBottomY < 1 && LAYOUT.topBandBottomY > 0);
  assert.ok(LAYOUT.holdY < LAYOUT.bottomBandTopY && LAYOUT.holdY > -1);
  assert.equal(uiFont(22), '32px "VT323", monospace');
  assert.equal(cardFont(30), '30px "VT323", Arial, sans-serif');
});

test('fillTextCentered uses an integer corrected baseline', () => {
  const calls = [];
  const ctx = {
    textBaseline: 'alphabetic',
    measureText: ref => ({ actualBoundingBoxAscent: ref === 'H' ? 8 : 10, actualBoundingBoxDescent: 2 }),
    fillText: (...args) => calls.push(args),
  };
  fillTextCentered(ctx, 'WIN', 12.7, 20.3, 'H');
  assert.equal(ctx.textBaseline, 'middle');
  assert.deepEqual(calls, [['WIN', 13, 23]]);
});
