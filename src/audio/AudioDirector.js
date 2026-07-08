import { TUPLAUS, TUPLAUS_MAX_RATE, ATTRACT, winMelody, countUp } from './tunes.js';

export class AudioDirector {
  constructor(audioSystem, gameManager) {
    this.audio = audioSystem;
    this.gm = gameManager;
    this._doubleStreak = 0;   // successful doubles this gamble run; drives tune tempo
    this._tuplausActive = false; // tune keeps playing across the whole gamble run
    this._graceUntil = 0;     // lets the collect count-up outlive the idle transition
    this._subscribe();
    // When audio becomes available (after the user's first interaction), start the
    // attract tune if we're still in attract mode.
    if (typeof audioSystem.init === 'function') {
      audioSystem.init().then(() => {
        if (this.gm.state === 'attract') this._playAttract();
      }).catch(() => {});
    }
  }

  // Dip the tuplaus tune under a sound effect; it resumes right after.
  _duckMusic(seconds) {
    if (this._tuplausActive) this.audio.music?.duck?.(seconds);
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
    this.audio.music.playSequence(winMelody(rank), { loop: false });
  }

  // The iconic payout tally: rapid rising ticks (capped so long wins stay short).
  _playCountUp(amount) {
    if (!this._musicReady()) return;
    this.audio.music.playSequence(countUp(amount), { loop: false });
  }

  _tuplausRate() {
    return Math.min(Math.pow(1.25, this._doubleStreak), TUPLAUS_MAX_RATE);
  }

  // Looping tuplaus (double-or-nothing) tune. Tempo comes from the rate so a
  // successful double speeds the playing tune up without restarting it.
  _playTuplaus() {
    if (!this._musicReady()) return;
    this.audio.music.playSequence(TUPLAUS, { loop: true, rate: this._tuplausRate() });
  }

  // Looping attract jingle (faithful chiptune; tune vs reference during verification).
  _playAttract() {
    if (!this._musicReady()) return;
    this.audio.music.playSequence(ATTRACT, { loop: true });
  }

  _stopMusic() {
    if (this.audio.music) this.audio.music.stop();
  }

  _subscribe() {
    const gm = this.gm;
    gm.addEventListener('shuffle', () => {
      this._sfx('shuffle');
      this._duckMusic(0.5);
    });
    gm.addEventListener('cardDealt', ({ count }) => {
      this._sfx('cardDeal', { count, spacing: 0.11 });
      this._duckMusic(0.6);
    });
    gm.addEventListener('noWin', () => this._sfx('lose'));
    gm.addEventListener('win', ({ result }) => {
      this._doubleStreak = 0;   // fresh hand win: gamble run starts over
      this._tuplausActive = false;
      this._playWinMelody(result.rank);
    });
    gm.addEventListener('collected', ({ amount }) => {
      // Accepting the win ends the tuplaus tune; the count-up tally takes
      // over, with a grace window so the idle transition can't cut it off.
      this._tuplausActive = false;
      this._graceUntil = Date.now() + 2500;
      this._playCountUp(amount);
    });
    gm.addEventListener('doubleStarted', () => {
      this._tuplausActive = true;
      this._playTuplaus();
    });
    gm.addEventListener('doubleResult', ({ outcome }) => {
      if (outcome === 'win') {
        this._doubleStreak++;
        // The tune plays on through the whole run: the triumph sweep rides
        // a brief dip, then the loop continues at the faster streak tempo.
        this._sfx('doubleWin');
        this._duckMusic(0.7);
        this.audio.music.setRate?.(this._tuplausRate());
      } else {
        this._doubleStreak = 0;
        this._tuplausActive = false;
        // 'keep' (red 7) auto-collects; the collected handler takes over.
        if (outcome === 'lose') {
          this._stopMusic();
          this._sfx('lose');
        }
      }
    });
    gm.addEventListener('stateChanged', ({ state }) => {
      if (state === 'dealing') this._tuplausActive = false;
      if (state === 'attract') {
        this._tuplausActive = false;
        this._playAttract();
      } else if (!this._tuplausActive && Date.now() >= this._graceUntil) {
        // The tuplaus tune plays through every gamble state; anything else
        // silences the music (unless the collect count-up is still going).
        this._stopMusic();
      }
    });
  }
}
