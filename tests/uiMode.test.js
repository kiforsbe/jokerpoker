import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI_MODES, getUiMode, setUiMode, cycleUiMode, onUiModeChanged } from '../src/ui/uiMode.js';

test('defaults to cabinet and exposes the three modes', () => {
  assert.deepEqual(UI_MODES, ['cabinet', 'overlay', 'screen']);
  assert.equal(getUiMode(), 'cabinet');
});

test('cycle walks cabinet -> overlay -> screen -> cabinet', () => {
  setUiMode('cabinet');
  assert.equal(cycleUiMode(), 'overlay');
  assert.equal(cycleUiMode(), 'screen');
  assert.equal(cycleUiMode(), 'cabinet');
});

test('setUiMode rejects unknown modes and notifies listeners once', () => {
  setUiMode('cabinet');
  const seen = [];
  const off = onUiModeChanged(m => seen.push(m));
  assert.equal(setUiMode('bogus'), 'cabinet');
  assert.equal(setUiMode('cabinet'), 'cabinet'); // no-op, no event
  assert.equal(setUiMode('screen'), 'screen');
  off();
  setUiMode('cabinet');
  assert.deepEqual(seen, ['screen']);
});
