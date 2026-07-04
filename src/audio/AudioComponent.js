import Component from '../engine/Component.js';
import { RetroSound } from './RetroSound.js';

export class AudioComponent extends Component {
    constructor() {
        super();
        this._audioSystem = null;
        this.sounds = new Map();
    }

    get type() {
        return 'Audio';
    }

    onAdd() {
        if (this.engine) {
            this._audioSystem = this.engine.systems.get('audio');
            if (this._audioSystem) {
                this._audioSystem.register(this);
            }
        }
    }

    onRemove() {
        if (this._audioSystem) {
            this._audioSystem.unregister(this);
            this._audioSystem = null;
        }
        this.sounds.forEach(sound => sound.dispose());
        this.sounds.clear();
    }

    onAudioInit(audioContext, masterGain) {
        // Create sounds when audio is initialized
        this.createSounds(audioContext, masterGain);
    }

    onVolumeChanged(volume) {
        this.sounds.forEach(sound => sound.setVolume(volume));
    }

    createSounds(audioContext, masterGain) {
        this.sounds.set('deal', new RetroSound(audioContext, masterGain, 220, 0.1));
        this.sounds.set('buttonPress', new RetroSound(audioContext, masterGain, 440, 0.05));
        this.sounds.set('win', new RetroSound(audioContext, masterGain, 880, 0.2));
        this.sounds.set('lose', new RetroSound(audioContext, masterGain, 110, 0.2));
        this.sounds.set('cardFlip', new RetroSound(audioContext, masterGain, 330, 0.05));
        this.sounds.set('countTick', new RetroSound(audioContext, masterGain, 660, 0.02));
        this.sounds.set('burst', new RetroSound(audioContext, masterGain, 1100, 0.08));

        // Configure effects
        this.sounds.get('win').addFrequencySlide(880, 1760);
        this.sounds.get('win').setRepeats(3);
        this.sounds.get('lose').addFrequencySlide(110, 55);
        this.sounds.get('cardFlip').addFrequencySlide(330, 220);
        this.sounds.get('burst').addFrequencySlide(1100, 550);
    }

    playSound(name) {
        const sound = this.sounds.get(name);
        if (sound) {
            sound.play();
        }
    }
}

// Convenience methods
export class GameAudioComponent extends AudioComponent {
    playDeal() { this.playSound('deal'); }
    playButtonPress() { this.playSound('buttonPress'); }
    playWin() { this.playSound('win'); }
    playLose() { this.playSound('lose'); }
    playCardFlip() { this.playSound('cardFlip'); }
    playCountTick() { this.playSound('countTick'); }
    playBurst() { this.playSound('burst'); }
}