import Component from '../engine/Component.js';
import * as THREE from 'three';

class CardFlipAnimation extends Component {
    constructor() {
        super();
        this.isFlipping = false;
        this.flipProgress = 0;
        this.flipSpeed = 3; // Flips per second
        this.targetFaceUp = true;
        this.faceSwapped = false;
        this.initialRotation = new THREE.Euler();
        this.onFlipComplete = null;
    }

    get type() {
        return 'CardFlip';
    }

    // `targetFaceUp` is the face the card should be showing when the flip
    // finishes (Card.flip passes `!faceUp`, i.e. the state it's turning into).
    // `durationScale` stretches this one flip (2 = twice as slow); the
    // suspense reveal uses it to drag out near-win turns.
    startFlip(targetFaceUp = true, onComplete = null, durationScale = 1) {
        if (this.isFlipping) return;

        this.isFlipping = true;
        this.flipProgress = 0;
        this.durationScale = Math.max(durationScale, 0.01);
        this.targetFaceUp = targetFaceUp;
        this.faceSwapped = false;
        this.onFlipComplete = onComplete;

        // Store initial rotation
        this.initialRotation.copy(this.gameObject.rotation);

        // Play flip sound
        const audio = this.gameObject.getComponent('Audio');
        if (audio) {
            audio.playCardFlip();
        }
    }

    update(deltaTime) {
        if (!this.isFlipping) return;

        // Update flip progress
        this.flipProgress += (this.flipSpeed / (this.durationScale || 1)) * deltaTime;
        if (this.flipProgress >= 1) {
            this.flipProgress = 1;
            this.isFlipping = false;

            // Always rest facing the camera. The card is a single-sided canvas
            // texture on a DoubleSide plane, so resting at PI would show the
            // plane's back and mirror the artwork horizontally. The texture swap
            // below is what actually changes which face is shown.
            this.gameObject.rotation.copy(this.initialRotation);
            this.gameObject.rotation.y = 0;
            this.swapFace();

            if (this.onFlipComplete) {
                this.onFlipComplete();
                this.onFlipComplete = null;
            }
            return;
        }

        // Turn the card edge-on (PI/2) and back to 0. Under the orthographic
        // camera this yields the same "narrow to a line and expand" silhouette
        // as a full 180 turn, but never exposes the mirrored back face.
        this.gameObject.rotation.y = (Math.PI / 2) * (1 - Math.abs(1 - 2 * this.flipProgress));

        // Swap the drawn face while the card is edge-on so the change is hidden.
        if (this.flipProgress >= 0.5) {
            this.swapFace();
        }
    }

    // Redraw the card texture so it shows the target face, at most once per flip.
    swapFace() {
        if (this.faceSwapped) return;
        this.faceSwapped = true;
        const cardRender = this.gameObject.getComponent('Render');
        if (cardRender && cardRender.isFlipped !== !this.targetFaceUp) {
            cardRender.flip();
        }
    }

    reset() {
        this.isFlipping = false;
        this.flipProgress = 0;
        this.gameObject.rotation.copy(this.initialRotation);
    }
}

export default CardFlipAnimation;