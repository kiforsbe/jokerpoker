import RenderComponent from './RenderComponent.js';
import GameObject from '../engine/GameObject.js';
import { PAYTABLE } from '../game/payouts.js';
import { getTheme, PALETTE, paintThemed, onThemeChanged, fillTextCentered } from './theme.js';

// World-space sprite size (orthographic units); width feeds the retro pixel
// grid. Wide enough that the longest row ("Three-of-a-kind" + value) fits
// at the standard 32px retro font; height keeps the 512x384 canvas aspect.
const PAYTABLE_WORLD_WIDTH = 1.1;
const PAYTABLE_WORLD_HEIGHT = PAYTABLE_WORLD_WIDTH * 0.75;

class PayTableComponent extends RenderComponent {
  constructor() {
    super();
    this.rows = PAYTABLE;          // [{key,name,payout}]
    this.highlightKey = '';
    this._offTheme = null;
  }

  get type() { return 'PayTable'; }

  onRenderSystemReady() {
    if (!this._renderSystem) return;
    const mesh = this.createSprite(
      this._renderSystem.createCanvasTexture(512, 384,
        (ctx) => paintThemed(ctx, (c) => this._draw(c), PAYTABLE_WORLD_WIDTH)),
      PAYTABLE_WORLD_WIDTH, PAYTABLE_WORLD_HEIGHT
    );
    mesh.renderOrder = 2;
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
    this._offTheme = onThemeChanged(() => this._redraw());
  }

  _draw(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const rowH = h / (this.rows.length + 0.6);
    const top = rowH * 0.3;
    // Resolves to the same snapped retro size as the Credits/Wins boxes
    // (32px on the shared pixel grid), so the pay table and the status
    // text render with identical VT323 glyphs.
    ctx.font = getTheme().uiFont(Math.round(rowH * 1.17));
    this.rows.forEach((row, i) => {
      // Center text in the highlight band (which spans 0..0.92 of the row).
      const y = top + i * rowH + rowH * 0.46;
      if (row.key === this.highlightKey) {
        ctx.fillStyle = PALETTE.payHighlight;
        ctx.fillRect(w * 0.008, top + i * rowH, w * 0.984, rowH * 0.92);
      }
      ctx.fillStyle = PALETTE.payText;
      ctx.textAlign = 'left';
      fillTextCentered(ctx, row.display || row.name, w * 0.027, y);
      ctx.textAlign = 'right';
      fillTextCentered(ctx, String(row.payout), w * 0.973, y);
    });
  }

  _redraw() {
    if (this.meshes[0] && this._renderSystem) {
      this.updateTexture(this.meshes[0], (ctx) => paintThemed(ctx, (c) => this._draw(c), PAYTABLE_WORLD_WIDTH));
    }
  }

  highlightWin(key) {
    this.highlightKey = key || '';
    this._redraw();
  }

  onRemove() {
    if (this._offTheme) { this._offTheme(); this._offTheme = null; }
    super.onRemove();
  }
}

export function createPayTable(x = 0.55, y = 0.25) {
  const obj = new GameObject('PayTable');
  obj.addComponent(new PayTableComponent());
  obj.position.set(x, y, 0);
  return obj;
}

export { PayTableComponent };
