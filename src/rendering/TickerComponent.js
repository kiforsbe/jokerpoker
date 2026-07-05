import * as THREE from 'three';
import RenderComponent from './RenderComponent.js';
import GameObject from '../engine/GameObject.js';
import { PALETTE, LAYOUT, SCREEN_ASPECT, getTheme, onThemeChanged, textureFilter } from './theme.js';

// Left-scrolling rules ticker on the bottom gray band, visible only while
// in tuplaus (double) mode. One tile of text is drawn to a canvas; the
// texture repeats horizontally and scrolling is just texture.offset.x.

const TICKER_TEXT =
  'TUPLAUS - DOUBLE OR NOTHING   •   LOW (PIENI · LÅG) = 2-6   •   ' +
  'HIGH (SUURI · HÖG) = 8-ACE   •   7 LOSES, RED 7 KEEPS THE WIN   •   ' +
  'DOUBLE UP TO HALF THE JACKPOT   •   ';

const WORLD_WIDTH = SCREEN_ASPECT * 2; // full screen width
const WORLD_HEIGHT = 0.12;             // fits inside the 0.17 bottom band
const CANVAS_HEIGHT = 48;              // px; density derives from WORLD_HEIGHT
const SCROLL_SPEED = 0.22;             // world units per second, leftwards

// States that count as "in double mode".
const GAMBLE_STATES = ['gambleDeal', 'gamble', 'gambleReveal'];

class TickerComponent extends RenderComponent {
  constructor(gameManager) {
    super();
    this.gm = gameManager;
    this._canvas = null;
    this._texture = null;
    this._offTheme = null;
  }

  get type() {
    return 'Ticker';
  }

  onRenderSystemReady() {
    if (!this._renderSystem) return;

    this._canvas = document.createElement('canvas');
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.wrapS = THREE.RepeatWrapping;
    this._drawTile();

    const geometry = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT);
    const material = new THREE.MeshBasicMaterial({
      map: this._texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'RulesTicker';
    mesh.renderOrder = 3;
    mesh.visible = GAMBLE_STATES.includes(this.gm.state);
    this.gameObject.add(mesh);
    this.meshes.push(mesh);

    this._onState = ({ state }) => {
      mesh.visible = GAMBLE_STATES.includes(state);
    };
    this.gm.addEventListener('stateChanged', this._onState);

    this._offTheme = onThemeChanged(() => this._drawTile());
  }

  // Draw one tile: the rules line plus its trailing gap, so the repeat
  // wraps seamlessly. Canvas width follows the measured text.
  _drawTile() {
    const canvas = this._canvas;
    const ctx = canvas.getContext('2d');
    const font = getTheme().uiFont(28);
    ctx.font = font;
    const textWidth = Math.ceil(ctx.measureText(TICKER_TEXT).width);
    canvas.width = Math.max(1, textWidth); // resizing resets ctx state
    canvas.height = CANVAS_HEIGHT;
    ctx.font = font;
    ctx.fillStyle = PALETTE.holdText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(TICKER_TEXT, 0, CANVAS_HEIGHT / 2 + 1);

    // Show a screen-wide window into the tile at natural glyph scale.
    const pxPerUnit = CANVAS_HEIGHT / WORLD_HEIGHT;
    this._texture.repeat.x = (WORLD_WIDTH * pxPerUnit) / canvas.width;
    this._texture.minFilter = this._texture.magFilter = textureFilter();
    this._texture.generateMipmaps = false;
    this._texture.needsUpdate = true;
  }

  update(deltaTime) {
    const mesh = this.meshes[0];
    if (!mesh || !mesh.visible || !this._canvas?.width) return;
    // Content moves left, so the sampling window moves right (+offset).
    const tileWorldWidth = this._canvas.width / (CANVAS_HEIGHT / WORLD_HEIGHT);
    this._texture.offset.x =
      (this._texture.offset.x + (SCROLL_SPEED / tileWorldWidth) * deltaTime) % 1;
  }

  onRemove() {
    if (this._offTheme) { this._offTheme(); this._offTheme = null; }
    if (this._onState) {
      this.gm.removeEventListener?.('stateChanged', this._onState);
      this._onState = null;
    }
    super.onRemove();
  }
}

// Factory: the ticker sits centered on the bottom band's hold row.
export function createTicker(gameManager) {
  const obj = new GameObject('RulesTicker');
  obj.position.set(0, LAYOUT.holdY, 0.03);
  obj.addComponent(new TickerComponent(gameManager));
  return obj;
}

export default TickerComponent;
export { TickerComponent };
