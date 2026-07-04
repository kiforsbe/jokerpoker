import Component from '../engine/Component.js';
import * as THREE from 'three';

class CardMovementAnimation extends Component {
    constructor() {
        super();
        this.isMoving = false;
        this.startPosition = new THREE.Vector3();
        this.targetPosition = new THREE.Vector3();
        this.progress = 0;
        this.duration = 0.3;
        this.onComplete = null;
    }

    get type() {
        return 'CardMovement';
    }

    moveTo(target, duration = 0.3, onComplete = null) {
        if (this.isMoving) {
            this.stop(); // Stop any current animation
        }

        this.isMoving = true;
        this.progress = 0;
        this.duration = duration;
        this.onComplete = onComplete;

        // Store start position
        this.startPosition.copy(this.gameObject.position);

        // Store target position
        this.targetPosition.set(
            target.x ?? this.startPosition.x,
            target.y ?? this.startPosition.y,
            target.z ?? this.startPosition.z
        );
    }

    update(deltaTime) {
        if (!this.isMoving) return;

        // Update progress
        this.progress = Math.min(1, this.progress + (deltaTime / this.duration));

        // Calculate eased progress
        const easedProgress = this.easeOutCubic(this.progress);

        // Update position using lerp
        this.gameObject.position.lerpVectors(
            this.startPosition,
            this.targetPosition,
            easedProgress
        );

        // Check if animation is complete
        if (this.progress >= 1) {
            this.isMoving = false;
            // Ensure final position is exact
            this.gameObject.position.copy(this.targetPosition);
            
            if (this.onComplete) {
                this.onComplete();
                this.onComplete = null;
            }
        }
    }

    stop() {
        this.isMoving = false;
        this.progress = 0;
        this.onComplete = null;
    }

    // Smooth easing function
    easeOutCubic(x) {
        return 1 - Math.pow(1 - x, 3);
    }
}

export default CardMovementAnimation;