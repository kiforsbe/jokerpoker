import { RetroSound } from './RetroSound.js';

// Equal-temperament note frequency, semitones relative to A4 (440 Hz).
const N = (semis) => 440 * Math.pow(2, semis / 12);

export class AudioDirector {
  constructor(audioSystem, gameManager) {
    this.audio = audioSystem;
    this.gm = gameManager;
    this._doubleStreak = 0;   // successful doubles this gamble run; drives tune tempo
    this._registerEffects();
    this._subscribe();
    // When audio becomes available (after the user's first interaction), start the
    // attract tune if we're still in attract mode.
    if (typeof audioSystem.init === 'function') {
      audioSystem.init().then(() => {
        if (this.gm.state === 'attract') this._playAttract();
      }).catch(() => {});
    }
  }

  _registerEffects() {
    const a = this.audio;
    a.registerEffect('lose', (ctx, g) =>
      new RetroSound(ctx, g, 160, 0.32).setWaveform('square').addFrequencySlide(160, 70).setVolume(0.5));
    // Riffle shuffle: a train of short noise bursts (card edges flicking).
    // 14 ticks at 30ms each spans ~0.42s, matching the deck's split-and-merge
    // animation (0.9s of component time, halved by the engine's double update).
    a.registerEffect('shuffle', (ctx, g) =>
      new RetroSound(ctx, g, 2600, 0.03).setWaveform('noise')
        .addFrequencySlide(2600, 1300).setVolume(0.4).setRepeats(14));
    // One rising swish per dealt card; a multi-card draw becomes a quick run.
    a.registerEffect('cardDeal', (ctx, g, params) =>
      new RetroSound(ctx, g, 260, 0.07).setWaveform('triangle')
        .addFrequencySlide(260, 540).setVolume(0.5)
        .setRepeats(params?.count ?? 1));
  }

  _musicReady() {
    return this.audio.initialized && this.audio.music;
  }

  _sfx(name, params) {
    this.audio.playEffect(name, params);
  }

  // Ascending win melody; longer/higher for stronger hands (rank 1..9).
  _playWinMelody(rank) {
    if (!this._musicReady()) return;
    const steps = Math.min(3 + rank, 9);
    const notes = [];
    for (let i = 0; i < steps; i++) {
      notes.push({ freq: N(3 + i * 2), dur: 0.09, type: 'square' }); // climbing from C5
    }
    this.audio.music.playSequence(notes, { loop: false });
  }

  // The iconic payout tally: rapid rising ticks (capped so long wins stay short).
  _playCountUp(amount) {
    if (!this._musicReady()) return;
    const ticks = Math.min(Math.max(amount, 1), 40);
    const notes = [];
    for (let i = 0; i < ticks; i++) notes.push({ freq: 700 + i * 25, dur: 0.04, type: 'square' });
    this.audio.music.playSequence(notes, { loop: false });
  }

  // Looping tuplaus (double-or-nothing) tune: a brisk 30-note phrase played
  // three times, then a 9-note ending line, then round again. Note names are
  // German/Helmholtz: h = B natural, b = B flat, c1 = middle C (C4), c2 = C5.
  _playTuplaus() {
    if (!this._musicReady()) return;
    const C4 = N(-9), E4 = N(-5), F4 = N(-4), G4 = N(-2), A4 = N(0);
    const Bb4 = N(1), B4 = N(2), C5 = N(3), D5 = N(5);
    const phrase = [
      F4, C5, B4, C5, D5, C5, B4, C5,   C5, C5, B4, Bb4, Bb4, A4, G4,
      F4, C5, B4, C5, D5, C5, B4, C5,   Bb4, Bb4, B4, C5, Bb4, A4, G4,
    ];
    const ending = [C4, C4, C4, C4, C4, C4, G4, E4, C4];
    // Slow to start; each successful double in the run cranks the tempo 20%.
    const dur = Math.max(0.56 * Math.pow(0.8, this._doubleStreak), 0.12);
    const notes = [];
    for (let r = 0; r < 3; r++) {
      for (const freq of phrase) notes.push({ freq, dur, type: 'square' });
    }
    ending.forEach((freq, i) => {
      notes.push({ freq, dur: i === ending.length - 1 ? dur * 3 : dur, type: 'square' });
    });
    this.audio.music.playSequence(notes, { loop: true });
  }

  // Looping attract jingle (faithful chiptune; tune vs reference during verification).
  _playAttract() {
    if (!this._musicReady()) return;
    const C5 = N(3), E5 = N(7), G5 = N(10), C6 = N(15);
    const seq = [
      { freq: C5, dur: 0.18 }, { freq: E5, dur: 0.18 }, { freq: G5, dur: 0.18 }, { freq: C6, dur: 0.24 },
      { freq: 0,  dur: 0.12 }, { freq: G5, dur: 0.18 }, { freq: E5, dur: 0.18 }, { freq: C5, dur: 0.30 },
      { freq: 0,  dur: 0.30 },
    ].map(n => ({ ...n, type: 'square' }));
    this.audio.music.playSequence(seq, { loop: true });
  }

  _stopMusic() {
    if (this.audio.music) this.audio.music.stop();
  }

  _subscribe() {
    const gm = this.gm;
    gm.addEventListener('shuffle', () => this._sfx('shuffle'));
    gm.addEventListener('cardDealt', ({ count }) => this._sfx('cardDeal', { count }));
    gm.addEventListener('noWin', () => this._sfx('lose'));
    gm.addEventListener('win', ({ result }) => {
      this._doubleStreak = 0;   // fresh hand win: gamble run starts over
      this._playWinMelody(result.rank);
    });
    gm.addEventListener('collected', ({ amount }) => this._playCountUp(amount));
    gm.addEventListener('doubleStarted', () => this._playTuplaus());
    gm.addEventListener('doubleResult', ({ outcome }) => {
      if (outcome === 'win') this._doubleStreak++;
      else this._doubleStreak = 0;   // lose/keep ends the run
      if (outcome === 'lose') this._sfx('lose');
      // 'keep' (red 7) auto-collects immediately, which plays the count-up tally;
      // skip the win melody here so it isn't cut off mid-note by that count-up.
      else if (outcome === 'win') this._playWinMelody(3);
    });
    gm.addEventListener('stateChanged', ({ state }) => {
      if (state === 'attract') this._playAttract();
      else this._stopMusic();
    });
  }
}
