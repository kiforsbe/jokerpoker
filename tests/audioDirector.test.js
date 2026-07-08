import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioDirector } from '../src/audio/AudioDirector.js';

function makeFakes() {
  const played = [];
  const music = {
    sequences: [],
    stops: 0,
    rates: [],
    playSequence(notes, opts) { this.sequences.push({ notes, opts }); },
    setRate(r) { this.rates.push(r); },
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
  assert.equal(opts.rate, 1);
  assert.equal(notes.length, 99);
  assert.ok(Math.abs(notes[0].freq - 349.23) < 0.5);
  assert.ok(Math.abs(notes[98].freq - 261.63) < 0.5);
  assert.ok(notes.every(n => n.type === 'square'));
  assert.ok(Math.abs(notes[0].dur - 0.56) < 0.001);
});

test('each successful double cranks the tempo without restarting the tune', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);

  gm.emit('doubleStarted', {});
  const sequencesAfterStart = music.sequences.length;
  assert.equal(music.sequences.at(-1).opts.rate, 1);

  gm.emit('doubleResult', { outcome: 'win' });
  // No restart: the playing tune just gets faster.
  assert.equal(music.sequences.length, sequencesAfterStart);
  assert.ok(Math.abs(music.rates.at(-1) - 1.25) < 0.001);

  gm.emit('doubleResult', { outcome: 'win' });
  assert.ok(Math.abs(music.rates.at(-1) - 1.5625) < 0.001);

  // A fresh hand win resets the streak: the next run starts at rate 1.
  gm.emit('win', { result: { rank: 2 } });
  gm.emit('doubleStarted', {});
  assert.equal(music.sequences.at(-1).opts.rate, 1);
});

test('losing the double resets the tuplaus tempo', () => {
  const { audio, gm, music } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  gm.emit('doubleResult', { outcome: 'win' });
  gm.emit('doubleResult', { outcome: 'lose' });
  gm.emit('doubleStarted', {});
  assert.equal(music.sequences.at(-1).opts.rate, 1);
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

test('a successful double speeds the tune up instead of playing a win melody', () => {
  const { audio, gm, music, played } = makeFakes();
  new AudioDirector(audio, gm);
  gm.emit('doubleStarted', {});
  const sequences = music.sequences.length;
  gm.emit('doubleResult', { outcome: 'win' });
  assert.equal(music.sequences.length, sequences); // no restart, no win melody
  assert.ok(music.rates.length > 0);               // just faster
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
  assert.ok(music.rates.length > 0); // tune speeds up seamlessly
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
