import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlayer } from '../src/audio/MusicPlayer.js';

function makeFakeCtx() {
  const oscillators = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const ctx = {
    currentTime: 0,
    state: 'running',
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => {
      const osc = {
        type: 'sine',
        frequency: { setValueAtTime(v, t) { osc.freqSet = v; } },
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

// Every test stops the player before returning so no interval keeps the
// node --test process alive.

test('schedules only notes inside the look-ahead window', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 0.5 });
  player.playSequence([
    { freq: 440, dur: 0.2 }, { freq: 550, dur: 0.2 }, { freq: 660, dur: 0.2 }, { freq: 770, dur: 0.2 },
  ]);
  // Window is currentTime+0.5; notes start at ~0.05, 0.25, 0.45 — the fourth
  // (0.65) is beyond the horizon.
  assert.equal(oscillators.length, 3);

  ctx.currentTime = 0.4;
  player._tick();
  assert.equal(oscillators.length, 4);
  player.stop();
});

test('notes are scheduled back to back with correct start times', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 10 });
  player.playSequence([
    { freq: 440, dur: 0.25 }, { freq: 0, dur: 0.25 }, { freq: 660, dur: 0.5 },
  ]);
  // Rests produce no oscillator but still advance time.
  assert.equal(oscillators.length, 2);
  const starts = oscillators.map(o => o.started[0]);
  assert.ok(Math.abs(starts[1] - starts[0] - 0.5) < 1e-9, `gap was ${starts[1] - starts[0]}`);
  player.stop();
});

test('looping wraps around without a seam', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 1.0 });
  player.playSequence([{ freq: 440, dur: 0.3 }, { freq: 550, dur: 0.3 }], { loop: true });
  // 0.6s of song fills a 1.0s window once plus the wrapped first note.
  assert.ok(oscillators.length >= 3, `only ${oscillators.length} scheduled`);
  const starts = oscillators.map(o => o.started[0]);
  for (let i = 1; i < starts.length; i++) {
    assert.ok(Math.abs(starts[i] - starts[i - 1] - 0.3) < 1e-9, 'seam in the loop');
  }
  player.stop();
});

test('non-looping playback stops scheduling when the song ends', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 10 });
  player.playSequence([{ freq: 440, dur: 0.1 }]);
  assert.equal(oscillators.length, 1);
  ctx.currentTime = 5;
  player._tick();
  player._tick();
  assert.equal(oscillators.length, 1);
  player.stop();
});

test('setRate scales durations of subsequently scheduled notes', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 0.4 });
  player.playSequence([
    { freq: 440, dur: 0.3 }, { freq: 550, dur: 0.3 }, { freq: 660, dur: 0.3 },
  ], { loop: true });
  const before = oscillators.length;
  player.setRate(2);
  ctx.currentTime = 1.0;
  player._tick();
  const after = oscillators.slice(before);
  assert.ok(after.length >= 2);
  // At rate 2 a 0.3 note occupies 0.15s.
  const gap = after[1].started[0] - after[0].started[0];
  assert.ok(Math.abs(gap - 0.15) < 1e-9, `gap was ${gap}`);
  player.stop();
});

test('setRate guards against non-positive or NaN rates', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 0.4 });
  player.playSequence([{ freq: 440, dur: 0.2 }, { freq: 550, dur: 0.2 }], { loop: true });
  player.setRate(0);
  ctx.currentTime = 1.0;
  player._tick();
  assert.ok(oscillators.length > 2, 'channel froze after setRate(0)');
  player.stop();
});

test('multi-channel songs schedule every channel', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 10 });
  player.playSequence({
    channels: [
      { instrument: { type: 'square' }, notes: [{ freq: 440, dur: 0.2 }, { freq: 550, dur: 0.2 }] },
      { instrument: { type: 'triangle' }, notes: [{ freq: 110, dur: 0.4 }] },
    ],
  });
  assert.equal(oscillators.length, 3);
  assert.equal(oscillators.filter(o => o.type === 'triangle').length, 1);
  player.stop();
});

test('stop() silences already-scheduled notes and is idempotent', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 10 });
  player.playSequence([
    { freq: 440, dur: 0.2 }, { freq: 550, dur: 0.2 }, { freq: 660, dur: 0.2 },
  ], { loop: false });
  assert.equal(oscillators.length, 3);
  player.stop();
  for (const osc of oscillators) {
    assert.equal(osc.stopped.length, 2, 'oscillator was not cancelled');
  }
  player.stop();
  for (const osc of oscillators) assert.equal(osc.stopped.length, 2);
});

test('a zero-duration note cannot hang the scheduler', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 0.1 });
  player.playSequence([{ freq: 440, dur: 0 }], { loop: true });
  // The clamp (0.001s floor) schedules at most lookahead/0.001 = 100 notes
  // per tick instead of spinning forever.
  assert.ok(Number.isFinite(oscillators.length) && oscillators.length > 0);
  player.stop();
});

test('a song that fits entirely in the first tick releases its timer', () => {
  const { ctx } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 10 });
  player.playSequence([{ freq: 440, dur: 0.1 }]);
  assert.equal(player._timer, null);
  player.stop();
});

test('suspended context defers scheduling instead of stacking notes', () => {
  const { ctx, oscillators } = makeFakeCtx();
  const player = new MusicPlayer(ctx, { connect() {} }, { lookahead: 10 });
  player.playSequence([{ freq: 440, dur: 0.2 }, { freq: 550, dur: 0.2 }]);
  assert.equal(oscillators.length, 2);
  ctx.state = 'suspended';
  player.playSequence([{ freq: 440, dur: 0.2 }, { freq: 550, dur: 0.2 }], { loop: true });
  // Initial tick sees a suspended context: nothing scheduled yet.
  assert.equal(oscillators.length, 2);
  ctx.state = 'running';
  player._tick();
  assert.ok(oscillators.length > 2, 'nothing scheduled after resume');
  player.stop();
});
