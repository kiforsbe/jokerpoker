import { test } from 'node:test';
import assert from 'node:assert/strict';
import InputSystem from '../src/engine/InputSystem.js';

globalThis.window ??= {};

test('pointer NDC depends on displayed canvas bounds, not logical resolution or window', () => {
  const input = new InputSystem({ systems: new Map() });
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  input._renderSystem = { renderer: { domElement: { getBoundingClientRect: () => rect } } };

  assert.deepEqual(input._toNDC(500, 350), { x: 0, y: 0 });
  assert.deepEqual(input._toNDC(100, 50), { x: -1, y: 1 });
  rect.left = 25;
  rect.top = 100;
  rect.width = 400;
  rect.height = 300;
  assert.deepEqual(input._toNDC(225, 250), { x: 0, y: 0 });
});
