import RenderComponent from './RenderComponent.js';
import GameObject from '../engine/GameObject.js';
import { PAYTABLE } from '../game/payouts.js';
import { getTheme, PALETTE, paintThemed, onThemeChanged, fillTextCentered } from './theme.js';
import { t, onLanguageChanged } from '../i18n.js';

// World-space sprite size (orthographic units); width feeds the retro pixel
// grid. Wide enough that the longest translated row ("Kuningasvärisuora" +
// its 200 payout) fits at the standard 32px retro font without shrinking:
// 17 + 3 chars at 16px each needs ~334px of the 360px retro canvas.
const PAYTABLE_WORLD_WIDTH = 1.5;
const PAYTABLE_WORLD_HEIGHT = 0.825;

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
    // 640x352 matches the 1.5 x 0.825 world box's aspect ratio.
    const mesh = this.createSprite(
      this._renderSystem.createCanvasTexture(640, 352,
        (ctx) => paintThemed(ctx, (c) => this._draw(c), PAYTABLE_WORLD_WIDTH)),
      PAYTABLE_WORLD_WIDTH, PAYTABLE_WORLD_HEIGHT
    );
    mesh.renderOrder = 2;
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
    this._offTheme = onThemeChanged(() => this._redraw());
    this._offLang = onLanguageChanged(() => this._redraw());
  }

  _draw(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const rowH = h / (this.rows.length + 0.6);
    const top = rowH * 0.3;
    // Resolves to the same snapped retro size as the Credits/Wins boxes
    // (32px on the shared pixel grid), so the pay table and the status
    // text render with identical VT323 glyphs.
    const basePx = Math.round(rowH * 1.17);
    this.rows.forEach((row, i) => {
      // Center text in the highlight band (which spans 0..0.92 of the row).
      const y = top + i * rowH + rowH * 0.46;
      if (row.key === this.highlightKey) {
        ctx.fillStyle = PALETTE.payHighlight;
        ctx.fillRect(w * 0.008, top + i * rowH, w * 0.984, rowH * 0.92);
      }
      // Long translated names ("Kuningasvärisuora") must not run into the
      // payout column — shrink just that row until it fits.
      const name = t(row.key);
      const value = String(row.payout);
      let px = basePx;
      ctx.font = getTheme().uiFont(px);
      while (px > 8 &&
             ctx.measureText(name).width + ctx.measureText(value).width + w * 0.04
               > w * 0.946) {
        px--;
        ctx.font = getTheme().uiFont(px);
      }
      ctx.fillStyle = PALETTE.payText;
      ctx.textAlign = 'left';
      fillTextCentered(ctx, name, w * 0.027, y);
      ctx.textAlign = 'right';
      fillTextCentered(ctx, value, w * 0.973, y);
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
    if (this._offLang) { this._offLang(); this._offLang = null; }
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
