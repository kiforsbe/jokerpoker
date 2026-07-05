import * as THREE from 'three';
import RenderComponent from './RenderComponent.js';
import { paintThemed, onThemeChanged } from './theme.js';
import { drawCardBack, CARD_WORLD_WIDTH, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT } from './CardRenderComponent.js';

// The visible deck at the top-left of the playfield: a small face-down
// stack that stays put between hands (dealt cards spawn on top of it and
// fly to their slots), and plays a split-and-merge shuffle animation when
// the previous hand's cards are folded back in.
const DECK_WIDTH = CARD_WORLD_WIDTH;
const DECK_HEIGHT = CARD_WORLD_WIDTH * 1.4; // same 2.5:3.5 ratio as cards

// A second card back peeking out down-right gives the stack depth.
const STACK_OFFSET = 0.018;

// Shuffle animation: the stack splits into two halves that swing apart and
// merge back SHUFFLE_CYCLES times.
const SHUFFLE_DURATION = 0.9;  // seconds
const SHUFFLE_CYCLES = 3;
const SHUFFLE_SPLIT = 0.11;    // max horizontal half-separation (world units)
const SHUFFLE_TILT = 0.09;     // max rotation of each half (radians)

class DeckRenderComponent extends RenderComponent {
  constructor() {
    super();
    this._offTheme = null;
    this._shuffleT = -1;        // seconds into the animation; <0 = not running
    this._shuffleResolve = null;
    // Set by the game manager: clicking the deck acts as the PLAY button
    // (deal a new hand, or draw after holds).
    this.onClick = null;
  }

  handleClick() {
    this.onClick?.();
  }

  onRenderSystemReady() {
    if (!this._renderSystem) return;

    // One shared back texture for all stack meshes.
    const texture = this._renderSystem.createCanvasTexture(
      CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT,
      (ctx) => paintThemed(ctx, (c) => drawCardBack(c), DECK_WIDTH)
    );

    const geometry = new THREE.PlaneGeometry(DECK_WIDTH, DECK_HEIGHT);
    const makeMesh = (name, x, y, renderOrder) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false,
      }));
      mesh.name = name;
      mesh.position.set(x, y, 0);
      mesh.renderOrder = renderOrder;
      this.gameObject.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };

    // Bottom of the stack peeks out; the two "halves" lie on top of each
    // other when idle and separate only during the shuffle animation.
    // Cards render at order 5, so dealt cards always cover the deck.
    this.underMesh = makeMesh('DeckUnder', STACK_OFFSET, -STACK_OFFSET, 3);
    this.halfB = makeMesh('DeckHalfB', 0, 0, 4);
    this.halfA = makeMesh('DeckHalfA', 0, 0, 4);

    this._offTheme = onThemeChanged(() => {
      // The texture is shared, so redrawing it once updates all meshes.
      this.updateTexture(this.halfA, (ctx) => paintThemed(ctx, (c) => drawCardBack(c), DECK_WIDTH));
    });
  }

  // Plays the split-and-merge shuffle; resolves when the stack is back
  // together. Re-entrant calls resolve immediately alongside the running one.
  playShuffle() {
    if (!this.halfA) return Promise.resolve();
    if (this._shuffleT >= 0) return Promise.resolve();
    this._shuffleT = 0;
    return new Promise((resolve) => { this._shuffleResolve = resolve; });
  }

  update(deltaTime) {
    if (this._shuffleT < 0) return;
    this._shuffleT += deltaTime;
    const t = Math.min(1, this._shuffleT / SHUFFLE_DURATION);
    // sin gives SHUFFLE_CYCLES swings apart-and-back over the duration,
    // landing exactly merged (sin = 0) at t = 1.
    const s = Math.sin(t * Math.PI * SHUFFLE_CYCLES);
    const split = Math.abs(s) * SHUFFLE_SPLIT;
    this.halfA.position.x = -split;
    this.halfA.rotation.z = s * SHUFFLE_TILT;
    this.halfB.position.x = split;
    this.halfB.rotation.z = -s * SHUFFLE_TILT;

    if (t >= 1) {
      this.halfA.position.x = 0;
      this.halfA.rotation.z = 0;
      this.halfB.position.x = 0;
      this.halfB.rotation.z = 0;
      this._shuffleT = -1;
      this._shuffleResolve?.();
      this._shuffleResolve = null;
    }
  }

  onRemove() {
    if (this._offTheme) { this._offTheme(); this._offTheme = null; }
    this._shuffleResolve?.();
    this._shuffleResolve = null;
    super.onRemove();
  }
}

export default DeckRenderComponent;
export { DeckRenderComponent };
