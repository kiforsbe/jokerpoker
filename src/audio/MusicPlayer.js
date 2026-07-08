// Multi-voice chip-tune scheduler: notes are scheduled a short look-ahead
// window at a time, so loops have no seam, stop() is instant, and tempo can
// change mid-song (setRate) without restarting the tune.
const DEFAULT_INSTRUMENT = { type: 'square', gain: 0.6, attack: 0.01, releaseFrac: 0.95 };

export class MusicPlayer {
  constructor(audioContext, masterGain, { lookahead = 0.2, tickMs = 50 } = {}) {
    this.ctx = audioContext;
    this.gain = audioContext.createGain();
    this._volume = 0.5;
    this.gain.gain.value = this._volume;
    this.gain.connect(masterGain);
    this._lookahead = lookahead;
    this._tickMs = tickMs;
    this._channels = [];
    this._loop = false;
    this._rate = 1;
    this._playing = false;
    this._timer = null;
    this._active = new Set();
  }

  setVolume(v) { this._volume = v; this.gain.gain.value = v; }

  // Briefly silence the music without stopping the schedule — a sound
  // effect plays over the dip and the tune resumes where it would be.
  duck(seconds) {
    const g = this.gain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.setValueAtTime(this._volume, t + seconds);
  }

  // seq: flat [{ freq, dur, type? }] (freq 0 = rest) or
  //      { channels: [{ instrument?, notes }] }
  playSequence(seq, { loop = false, rate = 1 } = {}) {
    this.stop();
    const channels = Array.isArray(seq) ? [{ notes: seq }] : seq.channels;
    const startAt = this.ctx.currentTime + 0.05;
    this._channels = channels.map(ch => ({
      notes: ch.notes,
      instrument: { ...DEFAULT_INSTRUMENT, ...(ch.instrument || {}) },
      index: 0,
      nextTime: startAt,
    }));
    this._loop = loop;
    this._rate = rate;
    this._playing = true;
    this._tick();
    this._timer = setInterval(() => this._tick(), this._tickMs);
    // In Node (tests) an interval would keep the process alive; browsers
    // return a number with no unref.
    if (this._timer.unref) this._timer.unref();
  }

  // Seamless tempo change: applies to notes scheduled from now on.
  setRate(rate) { this._rate = rate; }

  _tick() {
    if (!this._playing) return;
    // While the context is suspended (phone asleep / app in the background)
    // currentTime is frozen — scheduling would stack every tick onto the
    // same instant and blast them all on resume.
    if (this.ctx.state !== 'running') return;

    const horizon = this.ctx.currentTime + this._lookahead;
    let allDone = true;
    for (const ch of this._channels) {
      while (ch.index < ch.notes.length && ch.nextTime < horizon) {
        const note = ch.notes[ch.index];
        const dur = note.dur / this._rate;
        if (note.freq > 0) this._scheduleNote(note, ch.instrument, ch.nextTime, dur);
        ch.nextTime += dur;
        ch.index++;
        if (this._loop && ch.index >= ch.notes.length) ch.index = 0;
      }
      if (this._loop || ch.index < ch.notes.length) allDone = false;
    }
    if (allDone) {
      // Song over: stop scheduling but let the tail notes ring out.
      this._playing = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }
  }

  _scheduleNote(note, inst, t, dur) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = note.type || inst.type;
    osc.frequency.setValueAtTime(note.freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(inst.gain, t + inst.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(inst.attack, dur * inst.releaseFrac));
    osc.connect(g); g.connect(this.gain);
    osc.start(t); osc.stop(t + dur);
    this._active.add(osc);
    osc.onended = () => this._active.delete(osc);
  }

  stop() {
    this._playing = false;
    this._channels = [];
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    // Notes are scheduled ahead, so cancel anything still queued to play.
    for (const osc of this._active) {
      try { osc.stop(); } catch { /* already ended */ }
    }
    this._active.clear();
  }
}
