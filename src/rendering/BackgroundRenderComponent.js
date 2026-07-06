import * as THREE from 'three';
import { RenderComponent } from './RenderComponent.js';
import { PALETTE, LAYOUT, paintThemed, onThemeChanged } from './theme.js';
import GameLogger from '../utils/GameLogger.js';

// The playfield: a dark bezel surround with a centered 4:3 "CRT screen" —
// blue field edge-to-edge with gray bands across the top (behind the status
// row) and the bottom (behind the hold indicators), matching the reference
// photos. No gray on the left/right sides.
// Screen plane is 8/3 x 2 world units (x ∈ [-1.333, 1.333] at ortho y ∈ [-1, 1]).
const SCREEN_TEXTURE_WIDTH = 1024;
const SCREEN_TEXTURE_HEIGHT = 768;
const SCREEN_PLANE_WIDTH = 8 / 3;
const SCREEN_PLANE_HEIGHT = 2;
const SURROUND_WIDTH = 8;      // covers any window aspect
const SURROUND_HEIGHT = 2.4;

class BackgroundRenderComponent extends RenderComponent {
  constructor() {
    super();
    this.logger = new GameLogger();
    this._offTheme = null;
    // Set by GameScene: (side) => void, called with 'small' | 'large' when
    // the player taps a field half during tuplaus. Everything else on the
    // table sits nearer the camera, so the background only receives clicks
    // that hit nothing more specific.
    this.onFieldGuess = null;
  }

  handleClick(raycaster) {
    if (!this.onFieldGuess) return;
    const screen = this.meshes[1]; // the 4:3 screen plane (index per onRenderSystemReady)
    if (!screen) return;
    const hits = raycaster.intersectObject(screen, false);
    if (!hits.length) return;
    this.onFieldGuess(hits[0].point.x < 0 ? 'small' : 'large');
  }

  onRenderSystemReady() {
    if (!this._renderSystem) {
      this.logger.log('ERROR', "Render system not ready in BackgroundComponent");
      return;
    }

    // Dark surround (the cabinet bezel outside the screen).
    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(SURROUND_WIDTH, SURROUND_HEIGHT),
      new THREE.MeshBasicMaterial({ color: PALETTE.surround, depthTest: false, depthWrite: false })
    );
    surround.name = 'BackgroundSurround';
    surround.renderOrder = -2;
    this.gameObject.add(surround);
    this.meshes.push(surround);

    // 4:3 screen: blue field with gray top/bottom bands.
    const texture = this._renderSystem.createCanvasTexture(
      SCREEN_TEXTURE_WIDTH, SCREEN_TEXTURE_HEIGHT,
      (ctx) => paintThemed(ctx, (c) => this._drawScreen(c), SCREEN_PLANE_WIDTH)
    );
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(SCREEN_PLANE_WIDTH, SCREEN_PLANE_HEIGHT),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
    );
    screen.name = 'BackgroundScreen';
    screen.renderOrder = -1;
    this.gameObject.add(screen);
    this.meshes.push(screen);

    this._offTheme = onThemeChanged(() => {
      this.updateTexture(screen, (ctx) => paintThemed(ctx, (c) => this._drawScreen(c), SCREEN_PLANE_WIDTH));
    });
  }

  _drawScreen(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    // World y (ortho [-1, 1], top = 1) to texture v coordinate.
    const yToV = (y) => ((1 - y) / 2) * h;

    ctx.fillStyle = PALETTE.field;
    ctx.fillRect(0, 0, w, h);

    // Gray bands only at the top (down to just below the status row) and
    // the bottom (hold-indicator strip) — never on the sides.
    ctx.fillStyle = PALETTE.frame;
    ctx.fillRect(0, 0, w, yToV(LAYOUT.topBandBottomY));
    ctx.fillRect(0, yToV(LAYOUT.bottomBandTopY), w, h - yToV(LAYOUT.bottomBandTopY));
  }

  onRemove() {
    if (this._offTheme) { this._offTheme(); this._offTheme = null; }
    super.onRemove();
  }
}

export default BackgroundRenderComponent;
export { BackgroundRenderComponent };
