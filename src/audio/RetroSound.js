export class RetroSound {
    constructor(audioContext, masterGain, frequency, duration) {
        this.audioContext = audioContext;
        this.masterGain = masterGain;
        this.frequency = frequency;
        this.duration = duration;
        this.volume = 1.0;
        this.repeats = 1;
        this.slides = [];
        this.waveform = 'square';
        this.attack = 0.005;
        this.release = null; // defaults to duration
    }

    addFrequencySlide(from, to) {
        this.slides.push({ from, to });
        return this;
    }

    setRepeats(count) {
        this.repeats = count;
        return this;
    }

    setVolume(volume) {
        this.volume = volume;
        return this;
    }

    setWaveform(type) { this.waveform = type; return this; }
    setEnvelope(attack, release) { this.attack = attack; this.release = release; return this; }

    play() {
        for (let i = 0; i < this.repeats; i++) {
            setTimeout(() => this.playOnce(), i * this.duration * 1000);
        }
    }

    playOnce() {
        const gain = this.audioContext.createGain();
        // 'noise' plays filtered white noise; the frequency/slide API steers
        // the bandpass center instead of an oscillator pitch.
        const source = this.waveform === 'noise' ? this._createNoise() : this._createOscillator();

        const now = this.audioContext.currentTime;
        const rel = this.release ?? this.duration;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.volume), now + this.attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + this.attack + rel);

        source.output.connect(gain);
        gain.connect(this.masterGain);

        source.node.start();
        source.node.stop(now + this.attack + rel + 0.02);
    }

    _createOscillator() {
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = this.waveform;
        oscillator.frequency.setValueAtTime(this.frequency, this.audioContext.currentTime);
        this._applySlides(oscillator.frequency);
        return { node: oscillator, output: oscillator };
    }

    _createNoise() {
        const ctx = this.audioContext;
        const length = Math.ceil(ctx.sampleRate * (this.attack + (this.release ?? this.duration) + 0.05));
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 0.8;
        filter.frequency.setValueAtTime(this.frequency, ctx.currentTime);
        this._applySlides(filter.frequency);

        noise.connect(filter);
        return { node: noise, output: filter };
    }

    _applySlides(param) {
        this.slides.forEach(slide => {
            param.setValueAtTime(slide.from, this.audioContext.currentTime);
            param.exponentialRampToValueAtTime(
                slide.to,
                this.audioContext.currentTime + this.duration
            );
        });
    }

    dispose() {
        this.slides = [];
    }
}

export default RetroSound;
