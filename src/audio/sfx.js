import { ZZFX } from './vendor/zzfx.js';

// Samples come out full-scale; loudness lives in each param array's volume
// slot and in AudioSystem's master gain (ZzFX's own .3 default would
// double-attenuate on top of the master gain).
ZZFX.volume = 1;

// ZzFX parameter order (21 slots):
// [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
//  slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation,
//  bitCrush, delay, sustainVolume, decay, tremolo, filter]
// Shapes: 0 sin, 1 triangle, 2 saw, 3 tan, 4 noise-ish; shapeCurve 0 squares
// the wave off, so [.., 1, 0, ..] is the PSG square used for most effects.
// Randomness stays 0 everywhere: the original machine's sounds never varied.
//
// These are STARTING POINTS designed against the reference recordings listed
// in the spec; final values are tuned by ear (Task 7).
export const SFX_PARAMS = {
  // Short square blip — panel button tick.
  buttonPress: [1, 0, 440, .001, .02, .04, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  // Rising triangle swish, one per dealt card.
  cardDeal:    [1, 0, 260, .001, .04, .05, 1, 1, 14, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  // Quick falling blip when a card turns over.
  cardFlip:    [.8, 0, 330, .001, .01, .04, 1, 0, -8, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  // Two-tone confirm (pitch jump) when a card is held.
  hold:        [1, 0, 523, .001, .05, .05, 1, 0, 0, 0, 136, .04, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  // Riffle: noisy ticks retriggered every 30ms for ~0.45s (matches the
  // wall-clock shuffle animation; see the engine double-update note).
  shuffle:     [.6, 0, 2600, .001, .38, .06, 4, 0, -4, 0, 0, 0, .03, 2, 0, 0, 0, 1, 0, .6, 0],
  // Short rising fanfare hit on a winning hand.
  win:         [1, 0, 880, .001, .25, .15, 1, 0, 0, 0, 220, .06, .09, 0, 0, 0, 0, 1, 0, 0, 0],
  // Falling square womp on a lost hand / failed double ("GOSH").
  lose:        [1, 0, 160, .001, .15, .17, 1, 0, -9, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  // Triumphant rising sweep, repeated, on a successful double.
  doubleWin:   [1, 0, 523, .001, .3, .06, 1, 0, 16, 0, 0, 0, .12, 0, 0, 0, 0, 1, 0, 0, 0],
  // Tiny tick for the payout tally.
  countTick:   [.7, 0, 660, .001, .008, .012, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  // Falling sparkle for particle bursts.
  burst:       [.8, 0, 1100, .001, .04, .08, 1, 0, -12, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
};

// Generates each effect's samples once (lazily), keeps them as AudioBuffers
// on the host context, and plays them through the supplied destination node.
export class SfxRegistry {
  constructor(audioContext, destination, params = SFX_PARAMS) {
    this.ctx = audioContext;
    this.dest = destination;
    this.params = params;
    this.buffers = new Map();
  }

  has(name) {
    return Object.prototype.hasOwnProperty.call(this.params, name);
  }

  _buffer(name) {
    let buf = this.buffers.get(name);
    if (!buf) {
      const samples = ZZFX.buildSamples(...this.params[name]);
      buf = this.ctx.createBuffer(1, samples.length, ZZFX.sampleRate);
      buf.getChannelData(0).set(samples);
      this.buffers.set(name, buf);
    }
    return buf;
  }

  play(name, { count = 1, spacing } = {}) {
    if (!this.has(name)) return;
    const buf = this._buffer(name);
    const gap = spacing ?? buf.duration;
    for (let i = 0; i < count; i++) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.dest);
      src.start(this.ctx.currentTime + i * gap);
    }
  }
}
