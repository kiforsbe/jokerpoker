import * as THREE from 'three';
import RenderComponent from './RenderComponent.js';
import GameObject from '../engine/GameObject.js';
import { SCREEN_ASPECT } from './displayProfiles.js';
import { PALETTE, LAYOUT } from './uiStyle.js';
import { t, onLanguageChanged } from '../i18n.js';

// Left-scrolling rules ticker on the bottom gray band, visible only while
// in tuplaus (double) mode. One tile of text is drawn to a canvas; the
// texture repeats horizontally and scrolling is just texture.offset.x.

// Each rule rides in its own dark pill; the pills scroll as a train.
// Within a pill every word is colored by what it means, palette-only:
// key words and values pop (cyan LOW like the hold boxes, bet-oval yellow
// HIGH and jackpot money, pay-highlight red for the losing/red 7, cyan
// for keeping the win), while glue words sit back in the band's off-white.
// Built per display language.
const WHITE = PALETTE.statusText;
const GLUE = PALETTE.frame;
const YELLOW = PALETTE.betOval;
const CYAN = PALETTE.holdBg;
const RED = PALETTE.payHighlight;

function tickerSections() {
  const [title, ...rest] = t('ticker_title').split(' - ');
  return [
    [{ t: title, c: YELLOW }, { t: ' - ', c: GLUE }, { t: rest.join(' - '), c: WHITE }],
    [{ t: t('low'), c: CYAN }, { t: ' = ', c: GLUE }, { t: '2-6', c: CYAN }],
    [{ t: t('high'), c: YELLOW }, { t: ' = ', c: GLUE }, { t: '8-A', c: YELLOW }],
    [{ t: t('seven_loses'), c: RED }, { t: ', ', c: GLUE }, { t: t('red_seven'), c: RED }, { t: t('keeps_win'), c: CYAN }],
    [{ t: t('double_up_to'), c: GLUE }, { t: t('half_jackpot'), c: YELLOW }],
  ];
}

const WORLD_WIDTH = SCREEN_ASPECT * 2; // full screen width
const WORLD_HEIGHT = 0.12;             // fits inside the 0.17 bottom band
const TILE_WIDTH = 2560;                // room for the longest translated rule train
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
  }

  get type() {
    return 'Ticker';
  }

  onRenderSystemReady() {
    if (!this._renderSystem) return;

    this._texture = this._renderSystem.createCanvasTexture(
      TILE_WIDTH,
      CANVAS_HEIGHT,
      (ctx) => this._drawTile(ctx),
      { worldWidth: WORLD_WIDTH, label: 'Ticker' },
    );
    this._canvas = this._texture.image;
    this._texture.wrapS = THREE.RepeatWrapping;
    this._configureTextureWindow();

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

    this._offLang = onLanguageChanged(() => this._redraw());
  }

  // Draw one tile: a train of dark pills (one rule each) plus a trailing
  // gap, so the repeat wraps seamlessly. The rasterizer owns canvas size.
  _drawTile(ctx) {
    const canvas = ctx.canvas;
    const scale = canvas.height / CANVAS_HEIGHT;
    const font = `${32 * scale}px "VT323", monospace`;
    ctx.font = font;
    const sections = tickerSections();
    const widths = sections.map(
      segs => segs.reduce((acc, s) => acc + Math.ceil(ctx.measureText(s.t).width), 0));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const marginY = PILL_MARGIN_Y * scale;
    const padX = PILL_PAD_X * scale;
    const gap = PILL_GAP * scale;
    const pillH = canvas.height - marginY * 2;
    let x = 0;
    sections.forEach((segs, i) => {
      const pillW = widths[i] + padX * 2;
      ctx.fillStyle = PILL_FILL;
      // Manual rounded path (arcTo) — ctx.roundRect is missing on
      // Safari < 16, and a throw here would abort the whole scene load.
      const r = pillH / 2, py = marginY;
      ctx.beginPath();
      ctx.moveTo(x + r, py);
      ctx.arcTo(x + pillW, py, x + pillW, py + pillH, r);
      ctx.arcTo(x + pillW, py + pillH, x, py + pillH, r);
      ctx.arcTo(x, py + pillH, x, py, r);
      ctx.arcTo(x, py, x + pillW, py, r);
      ctx.closePath();
      ctx.fill();
      let tx = x + padX;
      for (const seg of segs) {
        ctx.fillStyle = seg.c;
        ctx.fillText(seg.t, tx, canvas.height / 2 + scale);
        tx += Math.ceil(ctx.measureText(seg.t).width);
      }
      x += pillW + gap;
    });
  }

  _configureTextureWindow() {
    if (!this._texture) return;
    // Show a screen-wide window into the tile at natural glyph scale.
    const nativePixelsPerUnit = CANVAS_HEIGHT / WORLD_HEIGHT;
    this._texture.repeat.x = (WORLD_WIDTH * nativePixelsPerUnit) / TILE_WIDTH;
  }

  _redraw() {
    if (!this.meshes[0]) return;
    this.updateTexture(this.meshes[0], (ctx) => this._drawTile(ctx));
    this._configureTextureWindow();
  }

  update(deltaTime) {
    const mesh = this.meshes[0];
    if (!mesh || !mesh.visible || !this._canvas?.width) return;
    // Content moves left, so the sampling window moves right (+offset).
    const tileWorldWidth = TILE_WIDTH / (CANVAS_HEIGHT / WORLD_HEIGHT);
    this._texture.offset.x =
      (this._texture.offset.x + (SCROLL_SPEED / tileWorldWidth) * deltaTime) % 1;
  }

  onRemove() {
    if (this._offLang) { this._offLang(); this._offLang = null; }
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
