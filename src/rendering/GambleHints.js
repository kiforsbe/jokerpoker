import * as THREE from 'three';
import RenderComponent from './RenderComponent.js';
import GameObject from '../engine/GameObject.js';
import { PALETTE, getTheme, onThemeChanged, fillTextCentered } from './theme.js';
import { getUiMode, onUiModeChanged } from '../ui/uiMode.js';
import { t, onLanguageChanged } from '../i18n.js';

// LOW / HIGH tap hints flanking the tuplaus card. Only shown in the
// screen-only UI mode (where the field halves are the guess buttons) and
// only while a guess is awaited.

// ASCII arrows: VT323 may lack the ◄ ► glyphs. Text resolves through the
// display language at draw time.
const HINTS = [
  { text: () => `< ${t('low')} 2-6`, x: -0.72, color: PALETTE.holdBg },
  { text: () => `${t('high')} 8-A >`, x: 0.72, color: PALETTE.betOval },
];
const HINT_WORLD_WIDTH = 0.62;
const HINT_WORLD_HEIGHT = 0.14;
const HINT_Y = -0.46; // the hand row, level with the double card

class GambleHintsComponent extends RenderComponent {
  constructor(gameManager) {
    super();
    this.gm = gameManager;
    this._offTheme = null;
    this._offMode = null;
  }

  get type() {
    return 'GambleHints';
  }

  onRenderSystemReady() {
    if (!this._renderSystem) return;

    HINTS.forEach((hint) => {
      const texture = this._renderSystem.createCanvasTexture(256, 56,
        (ctx) => this._draw(ctx, hint));
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(HINT_WORLD_WIDTH, HINT_WORLD_HEIGHT),
        new THREE.MeshBasicMaterial({
          map: texture, transparent: true, depthTest: false, depthWrite: false,
        }));
      mesh.name = `GambleHint_${hint.x < 0 ? 'low' : 'high'}`;
      mesh.position.set(hint.x, 0, 0.02);
      mesh.renderOrder = 6;
      mesh.visible = false;
      this.gameObject.add(mesh);
      this.meshes.push(mesh);
    });

    const refresh = () => this._refresh();
    this._onState = refresh;
    this.gm.addEventListener('stateChanged', refresh);
    this._offMode = onUiModeChanged(refresh);
    const redraw = () => {
      this.meshes.forEach((mesh, i) =>
        this.updateTexture(mesh, (ctx) => this._draw(ctx, HINTS[i])));
    };
    this._offTheme = onThemeChanged(redraw);
    this._offLang = onLanguageChanged(redraw);
    this._refresh();
  }

  _draw(ctx, hint) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = hint.color;
    ctx.font = getTheme().uiFont(Math.round(h * 0.5));
    ctx.textAlign = 'center';
    fillTextCentered(ctx, hint.text(), w / 2, h / 2, 'H');
  }

  _refresh() {
    const show = getUiMode() === 'screen' && this.gm.state === 'gamble';
    this.meshes.forEach(m => { m.visible = show; });
  }

  onRemove() {
    if (this._offTheme) { this._offTheme(); this._offTheme = null; }
    if (this._offLang) { this._offLang(); this._offLang = null; }
    if (this._offMode) { this._offMode(); this._offMode = null; }
    if (this._onState) {
      this.gm.removeEventListener?.('stateChanged', this._onState);
      this._onState = null;
    }
    super.onRemove();
  }
}

export function createGambleHints(gameManager) {
  const obj = new GameObject('GambleHints');
  obj.position.set(0, HINT_Y, 0);
  obj.addComponent(new GambleHintsComponent(gameManager));
  return obj;
}

export default GambleHintsComponent;
