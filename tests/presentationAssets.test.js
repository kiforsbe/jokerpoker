import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preloadPresentationAssets } from '../src/assets/preloadPresentationAssets.js';

test('presentation preload awaits fonts and court images', async () => {
  const calls = [];
  const report = { loaded: 9, failed: [] };
  const result = await preloadPresentationAssets({
    fonts: { load: async value => calls.push(['font', value]) },
    preloadCourts: async () => { calls.push(['courts']); return report; },
    logger: { log: (...args) => calls.push(['log', ...args]) },
  });
  assert.equal(result, report);
  assert.deepEqual(calls, [['font', '32px "VT323"'], ['courts']]);
});

test('presentation preload logs failures without rejecting startup', async () => {
  const logs = [];
  const error = new Error('missing queen');
  const result = await preloadPresentationAssets({
    fonts: { load: async () => { throw new Error('font offline'); } },
    preloadCourts: async () => ({ loaded: 8, failed: [{ level: 'coarse-pixel', rank: 'Q', error }] }),
    logger: { log: (...args) => logs.push(args) },
  });
  assert.equal(result.loaded, 8);
  assert.equal(result.failed.length, 1);
  assert.ok(logs.some(([level, message]) => level === 'WARN' && /font/i.test(message)));
  assert.ok(logs.some(([level, message]) => level === 'WARN' && /court/i.test(message)));
});
