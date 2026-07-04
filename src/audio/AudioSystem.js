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
        const initHandler = async () => {
          await this.initialize();
          resolve(true);
          window.removeEventListener('click', initHandler);
          window.removeEventListener('keydown', initHandler);
          window.removeEventListener('touchstart', initHandler);
        };

        // Wait for user interaction
        window.addEventListener('click', initHandler, { once: true });
        window.addEventListener('keydown', initHandler, { once: true });
        window.addEventListener('touchstart', initHandler, { once: true });
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

      // Ensure audio context is running
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

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
