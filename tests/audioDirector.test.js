import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioDirector } from '../src/audio/AudioDirector.js';

function makeFakes() {
  const effects = new Map();
  const played = [];
  const music = {
    sequences: [],
    stops: 0,
    playSequence(notes, opts) { this.sequences.push({ notes, opts }); },
    stop() { this.stops++; },
  };
  const audio = {
    initialized: true,
    music,
    registerEffect(name, factory) { effects.set(name, factory); },
    playEffect(name, params) { played.push({ name, params }); },
  };
  const listeners = new Map();
  const gm = {
    state: 'idle',
    addEventListener(event, cb) { listeners.set(event, cb); },
    emit(event, data) { listeners.get(event)?.(data); },
  };
  return { audio, gm, effects, played, music };
}

test('doubleStarted plays the looping tuplaus tune', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  assert.equal(music.sequences.length, 1);
  const { notes, opts } = music.sequences[0];
  assert.equal(opts.loop, true);
  // 30-note phrase x3 plus the 9-note ending line.
  assert.equal(notes.length, 99);
  // Opens on f1 (F4) and the ending line lands on c1 (C4).
  assert.ok(Math.abs(notes[0].freq - 349.23) < 0.5);
  assert.ok(Math.abs(notes[98].freq - 261.63) < 0.5);
  // Bright: every note is a square wave.
  assert.ok(notes.every(n => n.type === 'square'));
  // Slow base tempo: ~0.56s per note.
  assert.ok(Math.abs(notes[0].dur - 0.56) < 0.001);
});

test('tuplaus tune speeds up with each successful double and resets on a new hand', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);

  gm.emit('doubleStarted', {});
  const base = music.sequences[0].notes[0].dur;

  gm.emit('doubleResult', { outcome: 'win' });
  gm.emit('doubleStarted', {});
  const afterOne = music.sequences.at(-1).notes[0].dur;
  assert.ok(afterOne < base, `expected ${afterOne} < ${base}`);

  gm.emit('doubleResult', { outcome: 'win' });
  gm.emit('doubleStarted', {});
  const afterTwo = music.sequences.at(-1).notes[0].dur;
  assert.ok(afterTwo < afterOne);

  // A fresh hand win resets the streak back to the slow base tempo.
  gm.emit('win', { result: { rank: 2 } });
  gm.emit('doubleStarted', {});
  assert.ok(Math.abs(music.sequences.at(-1).notes[0].dur - base) < 0.001);
});

test('losing the double resets the tuplaus tempo', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  gm.emit('doubleResult', { outcome: 'win' });
  gm.emit('doubleResult', { outcome: 'lose' });
  gm.emit('doubleStarted', {});
  const dur = music.sequences.at(-1).notes[0].dur;
  assert.ok(Math.abs(dur - 0.56) < 0.001);
});

test('leaving the gamble state stops the tuplaus tune', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  gm.emit('stateChanged', { state: 'gambleReveal' });
  assert.ok(music.stops > 0);
});

test('double result still plays a win or lose sound', () => {
  const { audio, gm, music, played } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleResult', { outcome: 'lose' });
  assert.ok(played.some(p => p.name === 'lose'));
  gm.emit('doubleResult', { outcome: 'win' });
  assert.ok(music.sequences.length > 0); // win melody
});

test('registers shuffle and cardDeal effects', () => {
  const { audio, gm, effects } = makeFakes();
  new AudioDirector(audio, gm);
  assert.ok(effects.has('shuffle'));
  assert.ok(effects.has('cardDeal'));
});

test('shuffle event plays the shuffle effect', () => {
  const { audio, gm, played } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('shuffle', {});
  assert.ok(played.some(p => p.name === 'shuffle'));
});

test('cardDealt event plays cardDeal with the dealt count', () => {
  const { audio, gm, played } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('cardDealt', { count: 3 });
  const hit = played.find(p => p.name === 'cardDeal');
  assert.ok(hit);
  assert.equal(hit.params.count, 3);
});

test('cardDeal factory repeats once per dealt card', () => {
  const { audio, gm, effects } = makeFakes();
  new AudioDirector(audio, gm);
  const sound = effects.get('cardDeal')({}, {}, { count: 3 });
  assert.equal(sound.repeats, 3);
  const single = effects.get('cardDeal')({}, {}, undefined);
  assert.equal(single.repeats, 1);
});

test('shuffle factory riffles with multiple rapid ticks', () => {
  const { audio, gm, effects } = makeFakes();
  new AudioDirector(audio, gm);
  const sound = effects.get('shuffle')({}, {});
  assert.equal(sound.waveform, 'noise');
  assert.ok(sound.repeats > 1);
  // Total tick-train length should roughly match the ~0.45s wall-clock
  // shuffle animation (0.9s at the engine's double update rate).
  const total = sound.repeats * sound.duration;
  assert.ok(total > 0.3 && total < 0.6, `total was ${total}`);
});
