import { GameObject } from '../engine/GameObject.js';
import Component from '../engine/Component.js';

export class ScreenShakeComponent extends Component {
    constructor() {
        super();
        this.duration = 0;
        this.intensity = 0;
        this.originalPosition = { x: 0, y: 0 };
    }

    get type() {
        return 'ScreenShake';
    }

    shake(intensity = 0.05, duration = 0.5) {
        this.intensity = intensity;
        this.duration = duration;
        this.totalDuration = duration;  // Store initial duration
        this.originalPosition = {
            x: this.gameObject.position.x,
            y: this.gameObject.position.y
        };
    }

    update(deltaTime) {
        if (this.duration > 0) {
            // Update duration
            this.duration -= deltaTime;

            // Apply shake
            if (this.gameObject) {
                const intensity = (this.duration / this.totalDuration) * this.intensity;
                this.gameObject.position.y = this.originalPosition.y + (Math.random() * 2 - 1) * intensity;
            }

            // Reset when done
            if (this.duration <= 0) {
                this.gameObject.position.y = this.originalPosition.y;
                this.duration = 0;
            }
        }
    }
}

// Factory function to create screen shake component
export function createScreenShake() {
    const shakeObject = new GameObject('ScreenShake');
    shakeObject.addComponent(new ScreenShakeComponent());
    return shakeObject;
}