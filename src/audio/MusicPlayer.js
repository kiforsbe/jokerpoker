// Schedules note sequences (melodies and looping tunes) via Web Audio look-ahead timing.
export class MusicPlayer {
  constructor(audioContext, masterGain) {
    this.ctx = audioContext;
    this.gain = audioContext.createGain();
    this.gain.gain.value = 0.5;
    this.gain.connect(masterGain);
    this._stopFlag = false;
    this._timer = null;
    this._active = new Set();
  }

  setVolume(v) { this.gain.gain.value = v; }

  // notes: [{ freq, dur, type }]  (freq 0 = rest). options: { loop }
  playSequence(notes, { loop = false } = {}) {
    this.stop();
    this._stopFlag = false;
    const startAt = this.ctx.currentTime + 0.05;
    const total = this._schedule(notes, startAt);
    if (loop) {
      const ms = total * 1000;
      this._timer = setInterval(() => {
        if (this._stopFlag) return;
        this._schedule(notes, this.ctx.currentTime + 0.02);
      }, ms);
    }
  }

  _schedule(notes, startAt) {
    let t = startAt;
    for (const n of notes) {
      if (n.freq > 0) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = n.type || 'square';
        osc.frequency.setValueAtTime(n.freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur * 0.95);
        osc.connect(g); g.connect(this.gain);
        osc.start(t); osc.stop(t + n.dur);
        this._active.add(osc);
        osc.onended = () => this._active.delete(osc);
      }
      t += n.dur;
    }
    return t - startAt;
  }

  stop() {
    this._stopFlag = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    // Notes are scheduled up-front, so cancel anything still queued to play.
    for (const osc of this._active) {
      try { osc.stop(); } catch { /* already ended */ }
    }
    this._active.clear();
  }
}
