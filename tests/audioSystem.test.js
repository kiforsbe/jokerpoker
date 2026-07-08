import { test } from 'node:test';
import assert from 'node:assert/strict';
import AudioSystem from '../src/audio/AudioSystem.js';

// AudioSystem's constructor builds a GameLogger, which does `window.gameLog
// = this` — there is no `window` in Node, so `new AudioSystem(null)` throws
// here. emit()/playEffect() (the only methods under test) don't touch
// this.logger, so we bypass the constructor via Object.create and set only
// the fields they read.
function makeSystem() {
  const played = [];
  const sys = Object.create(AudioSystem.prototype);
  sys.initialized = true;
  sys.sfx = { play(name, params) { played.push({ name, params }); } };
  return { sys, played };
}

test('emit shim routes legacy events to effects', () => {
  const { sys, played } = makeSystem();
  sys.emit('win');
  sys.emit('lose');
  assert.deepEqual(played.map(p => p.name), ['win', 'lose']);
});

test('emit cardHeld only plays the hold sound when a card becomes held', () => {
  const { sys, played } = makeSystem();
  sys.emit('cardHeld', { index: 1, held: true });
  sys.emit('cardHeld', { index: 1, held: false });
  assert.deepEqual(played.map(p => p.name), ['hold']);
});
