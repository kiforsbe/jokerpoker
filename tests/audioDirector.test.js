import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioDirector } from '../src/audio/AudioDirector.js';

function makeFakes() {
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
    playEffect(name, params) { played.push({ name, params }); },
  };
  const listeners = new Map();
  const gm = {
    state: 'idle',
    addEventListener(event, cb) { listeners.set(event, cb); },
    emit(event, data) { listeners.get(event)?.(data); },
  };
  return { audio, gm, played, music };
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

test('tuplaus tune keeps playing through the gamble states', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  const stopsAfterStart = music.stops;
  gm.emit('stateChanged', { state: 'gambleReveal' });
  gm.emit('stateChanged', { state: 'won' }); // successful double
  gm.emit('stateChanged', { state: 'gambleDeal' }); // doubling again
  gm.emit('stateChanged', { state: 'gamble' });
  assert.equal(music.stops, stopsAfterStart);
});

test('losing the double stops the tuplaus tune', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  const stopsAfterStart = music.stops;
  gm.emit('doubleResult', { outcome: 'lose' });
  assert.ok(music.stops > stopsAfterStart);
});

test('a successful double restarts the tune faster instead of a win melody', () => {
  const { audio, gm, music, played } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  const before = music.sequences.at(-1).notes[0].dur;
  gm.emit('doubleResult', { outcome: 'win' });
  const after = music.sequences.at(-1);
  assert.equal(after.opts.loop, true); // still the looping tuplaus tune
  assert.ok(after.notes[0].dur < before); // at the faster streak tempo
  assert.ok(played.some(p => p.name === 'doubleWin')); // triumph sfx over the dip
});

test('collecting during tuplaus hands the music over to the count-up', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  gm.emit('collected', { amount: 8 });
  const countUp = music.sequences.at(-1);
  assert.equal(countUp.opts.loop, false);
  // The idle transition right after must not cut the tally off.
  const stops = music.stops;
  gm.emit('stateChanged', { state: 'idle' });
  assert.equal(music.stops, stops);
});

test('double result still plays a win or lose sound', () => {
  const { audio, gm, music, played } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleResult', { outcome: 'lose' });
  assert.ok(played.some(p => p.name === 'lose'));
  gm.emit('doubleResult', { outcome: 'win' });
  assert.ok(music.sequences.length > 0); // win melody
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
