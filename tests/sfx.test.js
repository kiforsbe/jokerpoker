import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SfxRegistry, SFX_PARAMS } from '../src/audio/sfx.js';

function makeFakeCtx() {
  const sources = [];
  const ctx = {
    currentTime: 10,
    createBuffer: (channels, length, sampleRate) => {
      const data = new Float32Array(length);
      return {
        duration: length / sampleRate,
        getChannelData: () => data,
      };
    },
    createBufferSource: () => {
      const src = {
        buffer: null,
        connect() {},
        started: [],
        start(t) { this.started.push(t); },
      };
      sources.push(src);
      return src;
    },
  };
  return { ctx, sources };
}

const EXPECTED_EFFECTS = ['buttonPress', 'cardDeal', 'cardFlip', 'hold',
  'shuffle', 'win', 'lose', 'doubleWin', 'countTick', 'burst'];

test('every effect in the inventory has params and builds a non-silent buffer', () => {
  const { ctx } = makeFakeCtx();
  const registry = new SfxRegistry(ctx, { connect() {} });
  for (const name of EXPECTED_EFFECTS) {
    assert.ok(registry.has(name), `missing effect: ${name}`);
    const buf = registry._buffer(name);
    assert.ok(buf.duration > 0.005, `${name}: empty buffer`);
    const data = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    assert.ok(peak > 0.01, `${name}: silent buffer`);
  }
});

test('buffers are cached — building twice returns the same object', () => {
  const { ctx } = makeFakeCtx();
  const registry = new SfxRegistry(ctx, { connect() {} });
  assert.equal(registry._buffer('lose'), registry._buffer('lose'));
});

test('play() starts one source now', () => {
  const { ctx, sources } = makeFakeCtx();
  const registry = new SfxRegistry(ctx, { connect() {} });
  registry.play('buttonPress');
  assert.equal(sources.length, 1);
  assert.deepEqual(sources[0].started, [10]);
});

test('play() with count schedules spaced repeats', () => {
  const { ctx, sources } = makeFakeCtx();
  const registry = new SfxRegistry(ctx, { connect() {} });
  registry.play('cardDeal', { count: 3, spacing: 0.1 });
  assert.equal(sources.length, 3);
  assert.deepEqual(sources.map(s => s.started[0]), [10, 10.1, 10.2]);
});

test('unknown effect names are a silent no-op', () => {
  const { ctx, sources } = makeFakeCtx();
  const registry = new SfxRegistry(ctx, { connect() {} });
  registry.play('nope');
  assert.equal(sources.length, 0);
});

test('shuffle riffle spans roughly the 0.45s wall-clock shuffle animation', () => {
  const { ctx } = makeFakeCtx();
  const registry = new SfxRegistry(ctx, { connect() {} });
  const dur = registry._buffer('shuffle').duration;
  assert.ok(dur > 0.3 && dur < 0.6, `shuffle duration was ${dur}`);
});
