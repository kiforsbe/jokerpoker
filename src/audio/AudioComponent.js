import Component from '../engine/Component.js';

// Sound names predating the sfx registry, kept so call sites and any saved
// references stay valid.
const LEGACY_NAMES = { deal: 'cardDeal' };

export class AudioComponent extends Component {
    constructor() {
        super();
        this._audioSystem = null;
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
    }

    // Effects live in the shared registry now; nothing to build per component.
    onAudioInit() {}

    // Loudness is the master gain's job; per-component volume is gone.
    onVolumeChanged() {}

    playSound(name) {
        this._audioSystem?.playEffect(LEGACY_NAMES[name] ?? name);
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