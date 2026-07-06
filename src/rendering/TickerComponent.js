import * as THREE from 'three';
import RenderComponent from './RenderComponent.js';
import GameObject from '../engine/GameObject.js';
import { PALETTE, LAYOUT, SCREEN_ASPECT, getTheme, onThemeChanged, textureFilter } from './theme.js';

// Left-scrolling rules ticker on the bottom gray band, visible only while
// in tuplaus (double) mode. One tile of text is drawn to a canvas; the
// texture repeats horizontally and scrolling is just texture.offset.x.

// Each rule rides in its own dark pill; the pills scroll as a train.
// Within a pill every word is colored by what it means, palette-only:
// key words and values pop (cyan LOW like the hold boxes, bet-oval yellow
// HIGH and jackpot money, pay-highlight red for the losing/red 7, cyan
// for keeping the win), while translations and glue words sit back in the
// band's off-white.
const WHITE = PALETTE.statusText;
const GLUE = PALETTE.frame;
const YELLOW = PALETTE.betOval;
const CYAN = PALETTE.holdBg;
const RED = PALETTE.payHighlight;

const TICKER_SECTIONS = [
  [{ t: 'TUPLAUS', c: YELLOW }, { t: ' - ', c: GLUE }, { t: 'DOUBLE OR NOTHING', c: WHITE }],
  [{ t: 'LOW', c: CYAN }, { t: ' (PIENI · LÅG) = ', c: GLUE }, { t: '2-6', c: CYAN }],
  [{ t: 'HIGH', c: YELLOW }, { t: ' (SUURI · HÖG) = ', c: GLUE }, { t: '8-ACE', c: YELLOW }],
  [{ t: '7 LOSES', c: RED }, { t: ', ', c: GLUE }, { t: 'RED 7', c: RED }, { t: ' KEEPS THE WIN', c: CYAN }],
  [{ t: 'DOUBLE UP TO ', c: GLUE }, { t: 'HALF THE JACKPOT', c: YELLOW }],
];

const WORLD_WIDTH = SCREEN_ASPECT * 2; // full screen width
const WORLD_HEIGHT = 0.12;             // fits inside the 0.17 bottom band
const CANVAS_HEIGHT = 48;              // px; density derives from WORLD_HEIGHT
const SCROLL_SPEED = 0.22;             // world units per second, leftwards

// Pill styling (dark theme so the rules pop off the light gray band).
const PILL_FILL = '#14141f';
const PILL_MARGIN_Y = 4;               // px above/below each pill
const PILL_PAD_X = 20;                 // px between pill edge and text
const PILL_GAP = 26;                   // px between pills

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

  // Draw one tile: a train of dark pills (one rule each) plus a trailing
  // gap, so the repeat wraps seamlessly. Canvas width follows the layout.
  _drawTile() {
    const canvas = this._canvas;
    const ctx = canvas.getContext('2d');
    const font = getTheme().uiFont(28);
    ctx.font = font;
    const widths = TICKER_SECTIONS.map(
      segs => segs.reduce((acc, s) => acc + Math.ceil(ctx.measureText(s.t).width), 0));
    const total = widths.reduce((acc, w) => acc + w + PILL_PAD_X * 2 + PILL_GAP, 0);
    canvas.width = Math.max(1, total); // resizing resets ctx state
    canvas.height = CANVAS_HEIGHT;
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const pillH = CANVAS_HEIGHT - PILL_MARGIN_Y * 2;
    let x = 0;
    TICKER_SECTIONS.forEach((segs, i) => {
      const pillW = widths[i] + PILL_PAD_X * 2;
      ctx.fillStyle = PILL_FILL;
      // Manual rounded path (arcTo) — ctx.roundRect is missing on
      // Safari < 16, and a throw here would abort the whole scene load.
      const r = pillH / 2, py = PILL_MARGIN_Y;
      ctx.beginPath();
      ctx.moveTo(x + r, py);
      ctx.arcTo(x + pillW, py, x + pillW, py + pillH, r);
      ctx.arcTo(x + pillW, py + pillH, x, py + pillH, r);
      ctx.arcTo(x, py + pillH, x, py, r);
      ctx.arcTo(x, py, x + pillW, py, r);
      ctx.closePath();
      ctx.fill();
      let tx = x + PILL_PAD_X;
      for (const seg of segs) {
        ctx.fillStyle = seg.c;
        ctx.fillText(seg.t, tx, CANVAS_HEIGHT / 2 + 1);
        tx += Math.ceil(ctx.measureText(seg.t).width);
      }
      x += pillW + PILL_GAP;
    });

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
