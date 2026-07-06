import GameLogger from '../utils/GameLogger.js';
import { RetroSound } from './RetroSound.js';
import { MusicPlayer } from './MusicPlayer.js';

class AudioSystem {
  constructor(engine) {
    this.engine = engine;
    this.initialized = false;
    this.audioContext = null;
    this.masterGain = null;
    this.pendingSounds = [];
    this.components = new Set();
    this.volume = 0.3;
    this.initializationPromise = null;
    this.logger = new GameLogger();

    this.logger.log('DEBUG', 'AudioSystem: Created with initial settings', {
      volume: this.volume,
      initialized: this.initialized
    });
  }

  async init() {
    // Create a promise that resolves when audio is initialized
    if (!this.initializationPromise) {
      this.logger.log('DEBUG', 'AudioSystem: Waiting for user interaction to initialize');
      this.initializationPromise = new Promise((resolve) => {
        // NOTE: no 'touchstart' here — iOS does not count it as a user
        // activation, so an AudioContext created/resumed from it stays
        // suspended forever. touchend/pointerup/click all qualify.
        const events = ['pointerup', 'touchend', 'click', 'keydown'];
        const initHandler = async () => {
          await this.initialize();
          resolve(true);
          events.forEach(e => window.removeEventListener(e, initHandler));
        };
        events.forEach(e => window.addEventListener(e, initHandler, { once: true }));
      });
    }
    return this.initializationPromise;
  }

  async initialize() {
    if (this.initialized) {
      this.logger.log('DEBUG', 'AudioSystem: Already initialized');
      return;
    }

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioContext.destination);

      // Ensure audio context is running. On iOS Safari resume() can stay
      // pending forever if the browser didn't accept the triggering event
      // as a user activation — never let that block boot: give it a short
      // window, then fall through and keep retrying on later gestures.
      if (this.audioContext.state === 'suspended') {
        // resume() may hang forever OR reject outright when the browser
        // refuses the activation — either way audio must stay usable and
        // simply retry later, so swallow the rejection here.
        await Promise.race([
          this.audioContext.resume().catch(() => {}),
          new Promise(r => setTimeout(r, 400)),
        ]);
      }
      // Keep the context alive for the app's lifetime: iOS suspends (or
      // 'interrupt's) it on sleep / app switch and never resumes it by
      // itself, and the boot resume above may itself have been rejected.
      this._installAutoResume();

      this.initialized = true;

      this.logger.log('DEBUG', 'AudioSystem: Successfully initialized', {
        contextState: this.audioContext.state,
        sampleRate: this.audioContext.sampleRate,
        volume: this.volume
      });

      // Initialize components
      this.components.forEach(component => {
        component.onAudioInit(this.audioContext, this.masterGain);
      });

      // Play pending sounds
      while (this.pendingSounds.length > 0) {
        const { type, params } = this.pendingSounds.shift();
        this.playSound(type, params);
      }

      this._setupEffects();

      return true;
    } catch (error) {
      this.logger.log('ERROR', 'AudioSystem: Failed to initialize', { error: error.message });
      return false;
    }
  }

  // Resume the context whenever it is not running: after the boot unlock
  // was rejected (retry on the next accepted gesture) and after iOS
  // suspends it on phone sleep / app switch (retry when the page becomes
  // visible again, with the gesture listeners as a backstop for iOS
  // versions that demand a fresh user activation).
  _installAutoResume() {
    if (this._autoResumeInstalled) return;
    this._autoResumeInstalled = true;

    const tryResume = () => {
      const ctx = this.audioContext;
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
        ctx.resume().catch(() => { /* retried on the next signal */ });
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tryResume();
    });
    window.addEventListener('pageshow', tryResume);
    window.addEventListener('focus', tryResume);
    for (const e of ['pointerup', 'touchend', 'keydown']) {
      window.addEventListener(e, tryResume);
    }
  }

  register(component) {
    this.components.add(component);
    this.logger.log('DEBUG', 'AudioSystem: Component registered', {
      componentType: component.type,
      totalComponents: this.components.size
    });
    if (this.initialized) {
      component.onAudioInit(this.audioContext, this.masterGain);
    }
  }

  unregister(component) {
    this.components.delete(component);
    this.logger.log('DEBUG', 'AudioSystem: Component unregistered', {
      componentType: component.type,
      remainingComponents: this.components.size
    });
  }

  setMasterVolume(value) {
    const oldVolume = this.volume;
    this.volume = Math.max(0, Math.min(1, value));

    this.logger.log('DEBUG', 'AudioSystem: Volume changed', {
      previousVolume: oldVolume,
      newVolume: this.volume
    });

    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }

    this.components.forEach(component => {
      component.onVolumeChanged(this.volume);
    });
  }

  getMasterVolume() {
    return this.volume;
  }

  _setupEffects() {
    this.music = new MusicPlayer(this.audioContext, this.masterGain);
    this._effectFactories = this._effectFactories || new Map();
  }

  registerEffect(name, factory) {
    // factory(ctx, gain) -> RetroSound
    this._effectFactories = this._effectFactories || new Map();
    this._effectFactories.set(name, factory);
  }

  playEffect(name, params) {
    if (!this.initialized || !this._effectFactories) return;
    const factory = this._effectFactories.get(name);
    if (factory) factory(this.audioContext, this.masterGain, params).play();
  }

  emit(event, data) {
    // Back-compat shim: route legacy event names to effects.
    const map = { win: 'win', cardHeld: 'hold', lose: 'lose' };
    if (map[event]) this.playEffect(map[event]);
  }
}

export default AudioSystem;
