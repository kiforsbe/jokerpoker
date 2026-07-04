import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlayer } from '../src/audio/MusicPlayer.js';

function makeFakeCtx() {
  const oscillators = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    currentTime: 0,
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => {
      const osc = {
        type: 'sine',
        frequency: param(),
        connect() {},
        started: [],
        stopped: [],
        start(t) { this.started.push(t); },
        stop(t) { this.stopped.push(t); },
      };
      oscillators.push(osc);
      return osc;
    },
  };
  return { ctx, oscillators };
}

test('stop() silences already-scheduled notes', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} });
  player.playSequence([
    { freq: 440, dur: 0.2 }, { freq: 550, dur: 0.2 }, { freq: 660, dur: 0.2 },
  ], { loop: true });
  assert.equal(oscillators.length, 3);

  player.stop();
  // Every scheduled oscillator gets a second stop() call cancelling its tail.
  for (const osc of oscillators) {
    assert.equal(osc.stopped.length, 2, 'oscillator was not cancelled');
  }
  player.stop(); // idempotent: no double-cancel of already-cleared nodes
  for (const osc of oscillators) assert.equal(osc.stopped.length, 2);
});
