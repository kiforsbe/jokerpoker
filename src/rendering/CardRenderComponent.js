import * as THREE from 'three';
import RenderComponent from './RenderComponent.js';
import { uiFont, cardFont, fillTextCentered, PALETTE, LAYOUT } from './uiStyle.js';
import { drawCardBackArt, drawCourtArt, drawJokerArt } from './cardArt/cardArt.js';
import { t, onLanguageChanged } from '../i18n.js';

// Card face texture resolution. Higher than the mesh needs so text/pips stay
// crisp under the CRT shader; matches the 2.5:3.5 card ratio (538/384 = 1.4).
// Exported (with CARD_WORLD_WIDTH below) for the deck stack, which renders
// card backs at the same size as real cards.
export const CARD_TEXTURE_WIDTH = 384;
export const CARD_TEXTURE_HEIGHT = 538;

// "hold" indicator texture resolution and world size. The indicator is a
// cyan box that sits on the bottom gray band, under its card's column,
// 80% of the card width (defined below as CARD_WORLD_WIDTH).
const HOLD_TEXTURE_WIDTH = 128;
const HOLD_TEXTURE_HEIGHT = 48;
export const CARD_WORLD_WIDTH = 0.418;
const HOLD_WORLD_WIDTH = CARD_WORLD_WIDTH * 0.8;
const HOLD_WORLD_HEIGHT = HOLD_WORLD_WIDTH * (HOLD_TEXTURE_HEIGHT / HOLD_TEXTURE_WIDTH);

// Corner index rank and center pips share the same glyph scale (~1 of the
// 3 middle pip columns wide), so real cards read as a consistent size.
const RANK_GLYPH_SCALE = 0.33;

// Pips are small and tightly gridded on the machine's cards.
const PIP_FONT_SCALE = 0.24;

// Card face color palette.
const COLORS = {
  red: '#c81414',
  black: '#1a1a1a',
  faceBg: '#fbfbf3',
  faceBorder: '#9a9a9a',
  jokerText: '#7a2fb0',
};

// All fractions below are of the canvas width (w) or height (h) unless noted.

// Card shape.
const CARD_CORNER_RADIUS_SCALE = 0.09;

const HAIRLINE_WIDTH_SCALE = 0.012; // shared by the back lattice and front border

// Card front border.
const FRONT_BORDER_MIN_WIDTH = 1.5;

// Corner index (rank + suit tucked in the corner).
const CORNER_INDEX_X_SCALE = 1 / 7; // centered in columns 1-2 of a 7-column model
const CORNER_INDEX_RANK_Y_SCALE = 0.13;
const CORNER_INDEX_SUIT_Y_SCALE = 0.30;


// Ace: a single modest center pip, per the photos.
const ACE_SYMBOL_SCALE = 0.32;

class CardRenderComponent extends RenderComponent {
  constructor() {
    super();
    this.cardMesh = null;
    this.isFlipped = false;
    // Base unit for card size. Hand slots are 0.50 world units apart
    // (Game._handSlot), so 0.418 leaves a 0.08 gap between neighbors.
    // (Kept in sync with CARD_WORLD_WIDTH above, which sizes the hold box.)
    this.CARD_WIDTH = CARD_WORLD_WIDTH;
    this.CARD_HEIGHT = this.CARD_WIDTH * 1.4; // Maintains 2.5:3.5 ratio
  }

  onAdd() {
    // Adopt the card's facing BEFORE super.onAdd(): when the render system
    // is already initialized (every mid-game deal), super.onAdd() creates
    // and paints the texture immediately, and it must read the correct
    // isFlipped — otherwise face-down cards waiting on the deck are
    // painted face-up until their first flip redraws them.
    const cardComponent = this.gameObject?.getComponent('Card');
    if (cardComponent) {
      this.isFlipped = !cardComponent.faceUp;
    }
    super.onAdd();
  }

  onRemove() {
    if (this._offLang) { this._offLang(); this._offLang = null; }
    super.onRemove();
  }

  onRenderSystemReady() {
    if (!this._renderSystem) {
      console.error("Render system not ready in CardRenderComponent");
      return;
    }

    const cardComponent = this.gameObject.getComponent('Card');
    if (!cardComponent) {
      console.error('CardRenderComponent requires a CardComponent on the GameObject.');
      return;
    }

    const texture = this._renderSystem.createCanvasTexture(
      CARD_TEXTURE_WIDTH,
      CARD_TEXTURE_HEIGHT,
      (context) => this.drawCard(context, cardComponent),
      { worldWidth: this.CARD_WIDTH, label: 'Card' },
    );

    const cardGeometry = new THREE.PlaneGeometry(this.CARD_WIDTH, this.CARD_HEIGHT);
    const cardMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    this.cardMesh = new THREE.Mesh(cardGeometry, cardMaterial);
    this.cardMesh.name = "CardMesh";
    this.cardMesh.renderOrder = 5; // Higher than UI elements
    this.gameObject.add(this.cardMesh);
    this.meshes.push(this.cardMesh);

    // Holding is indicated only by the "hold" box on the bottom band —
    // the card itself is not moved, tinted, or outlined.
    const holdTexture = this._renderSystem.createCanvasTexture(
      HOLD_TEXTURE_WIDTH,
      HOLD_TEXTURE_HEIGHT,
      (ctx) => this._drawHoldLabel(ctx),
      { worldWidth: HOLD_WORLD_WIDTH, label: 'HoldLabel' },
    );
    const holdGeo = new THREE.PlaneGeometry(HOLD_WORLD_WIDTH, HOLD_WORLD_HEIGHT);
    const holdMat = new THREE.MeshBasicMaterial({ map: holdTexture, transparent: true, depthTest: false, depthWrite: false });
    this.holdLabel = new THREE.Mesh(holdGeo, holdMat);
    this.holdLabel.name = 'HoldLabel';
    // The indicator lives on the bottom band, not on the card, so it is
    // parented to the card's parent (the scene) — child positions are
    // relative to their parent, and this one must not inherit the card's
    // movement. update() keeps its x on the card's column.
    this.holdLabel.position.set(this.gameObject.position.x, LAYOUT.holdY, 0.02);
    this.holdLabel.renderOrder = 7;
    this.holdLabel.visible = false;
    (this.gameObject.parent ?? this.gameObject).add(this.holdLabel);
    this.meshes.push(this.holdLabel);

    this._offLang = onLanguageChanged(() => {
      if (!this._renderSystem) return;
      if (this.holdLabel) {
        this.updateTexture(this.holdLabel, (ctx) => this._drawHoldLabel(ctx));
      }
      // The joker card carries translated text ("JOKERI"), so repaint the
      // face too.
      const card = this.gameObject?.getComponent('Card');
      if (card?.value === 'Joker' && this.cardMesh) {
        this.updateTexture(this.cardMesh, (context) => this.drawCard(context, card));
      }
    });
  }

  _cardArtLevel() {
    return this._renderSystem?.activeDisplayProfile?.cardArtLevel ?? 'high-detail';
  }

  // Cyan "hold" box with a double blue border, per the reference photos.
  _drawHoldLabel(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.holdBg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PALETTE.holdBorder;
    const lw = Math.max(1, h * 0.06);
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
    const inset = h * 0.18;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.fillStyle = PALETTE.holdText;
      ctx.font = uiFont(Math.round(h * 0.55));
    ctx.textAlign = 'center';
    fillTextCentered(ctx, t('hold'), w / 2, h / 2, 'H');
  }

  // Tight grid pip arrangements matching the machine's cards (fractions of
  // card width/height). Columns L/C/R sit close together; the vertical band
  // is compressed toward the middle. Pips below 0.5 draw rotated 180°.
  static get PIP_LAYOUTS() {
    const L = 0.38, C = 0.5, R = 0.62;
    const L4 = 0.36, R4 = 0.64; // slightly wider for the 4-row grids
    return {
      '2':  [[C, 0.34], [C, 0.66]],
      '3':  [[C, 0.34], [C, 0.50], [C, 0.66]],
      '4':  [[L, 0.36], [R, 0.36], [L, 0.64], [R, 0.64]],
      '5':  [[L, 0.36], [R, 0.36], [C, 0.50], [L, 0.64], [R, 0.64]],
      '6':  [[L, 0.36], [R, 0.36], [L, 0.50], [R, 0.50], [L, 0.64], [R, 0.64]],
      '7':  [[L, 0.36], [R, 0.36], [C, 0.43], [L, 0.50], [R, 0.50], [L, 0.64], [R, 0.64]],
      '8':  [[L, 0.36], [R, 0.36], [C, 0.43], [L, 0.50], [R, 0.50], [C, 0.57], [L, 0.64], [R, 0.64]],
      '9':  [[L4, 0.32], [R4, 0.32], [L4, 0.44], [R4, 0.44], [C, 0.50], [L4, 0.56], [R4, 0.56], [L4, 0.68], [R4, 0.68]],
      '10': [[L4, 0.32], [R4, 0.32], [C, 0.38], [L4, 0.44], [R4, 0.44], [L4, 0.56], [R4, 0.56], [C, 0.62], [L4, 0.68], [R4, 0.68]],
    };
  }

  drawCard(context, cardComponent) {
    const ctx = context;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const radius = w * CARD_CORNER_RADIUS_SCALE;
    // Traces a rounded-rect path (not filled/stroked here) so callers can
    // fill, stroke, or clip to it as needed.
    const roundRect = (x, y, rw, rh, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + rw, y, x + rw, y + rh, r);
      ctx.arcTo(x + rw, y + rh, x, y + rh, r);
      ctx.arcTo(x, y + rh, x, y, r);
      ctx.arcTo(x, y, x + rw, y, r);
      ctx.closePath();
    };

    if (this.isFlipped) {
      drawCardBackArt(ctx, { x: 0, y: 0, width: w, height: h }, this._cardArtLevel());
      return;
    }

    // ---- Card front (single clean border) ----
    // Off-white card body with a thin gray border, inset by half the line
    // width so the stroke doesn't get clipped at the canvas edge.
    const lw = Math.max(FRONT_BORDER_MIN_WIDTH, w * HAIRLINE_WIDTH_SCALE);
    roundRect(lw / 2, lw / 2, w - lw, h - lw, radius);
    ctx.fillStyle = COLORS.faceBg;
    ctx.fill();
    ctx.strokeStyle = COLORS.faceBorder;
    ctx.lineWidth = lw;
    ctx.stroke();

    const suit = cardComponent.suit;
    const value = cardComponent.value;
    const red = (suit === 'Hearts' || suit === 'Diamonds');
    const color = red ? COLORS.red : COLORS.black;
    const SYM = { Hearts: '♥', Diamonds: '♦', Clubs: '♣', Spades: '♠', Special: '★' };
    const sym = SYM[suit] || '?';

    // All text below is drawn centered on its (x, y) anchor.
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ---- Corner indices: value over suit, tucked into the corner, top-left and
    // bottom-right (rotated). "10" gets a smaller font so it stays in its column.
    // The joker instead spells its name vertically down the corner, like on
    // real decks. ----
    const idxFont = Math.round(w * RANK_GLYPH_SCALE);
    const cornerX = w * CORNER_INDEX_X_SCALE;
    let drawIndex;
    if (value === 'Joker') {
      // The card's name spelled vertically down the corner, translated
      // ("JOKERI" in Finnish). The jester art leaves this column wider
      // than the normal index column, so the letters run large. VT323
      // (retro) inks ~35% smaller than bold Arial (hires) at equal px,
      // so the retro size compensates.
      const name = t('joker');
      const letterFont = Math.round(w * 0.18);
      // Generous top margin; the column then runs well down the card edge
      // (the mirrored one occupies the opposite edge, so they can't meet).
      const topY = h * 0.10;
      // Six letters (JOKERI) squeeze into the same corner band as five.
      const stepY = (h * 0.60) / (name.length - 1);
      drawIndex = () => {
        ctx.fillStyle = COLORS.jokerText;
        ctx.font = cardFont(letterFont);
        name.split('').forEach((ch, i) => {
          ctx.fillText(ch, cornerX, topY + i * stepY);
        });
      };
    } else {
      const idxText = value === '10' ? '10' : value.charAt(0);
      drawIndex = () => {
        // Rank value
        ctx.fillStyle = color;
        ctx.font = cardFont(idxFont);
        const valW = ctx.measureText(idxText).width;
        ctx.fillText(idxText, cornerX, h * CORNER_INDEX_RANK_Y_SCALE);
        // Suit, sized so its glyph width matches the rank width (capped at the rank
        // font so a wide "10" doesn't blow it up).
        let suitFont = idxFont;
        ctx.font = cardFont(suitFont);
        const suitW = ctx.measureText(sym).width;
        suitFont = Math.min(idxFont, suitFont * (valW / suitW));
        ctx.font = cardFont(Math.round(suitFont));
        ctx.fillText(sym, cornerX, h * CORNER_INDEX_SUIT_Y_SCALE);
      };
    }
    drawIndex(); // top-left, as drawn
    ctx.save();
    // Flip the canvas 180° around its center so the same drawIndex() call
    // lands in the bottom-right corner, rotated to read correctly upside-down.
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    drawIndex();
    ctx.restore();

    // ---- Joker illustration varies only by the generic art fidelity. ----
    if (value === 'Joker') {
      drawJokerArt(ctx, { x: 0, y: 0, width: w, height: h }, this._cardArtLevel());
      return;
    }

    // ---- Center artwork ----
    const layouts = CardRenderComponent.PIP_LAYOUTS;
    if (value === 'A') {
      // Ace: single oversized suit symbol, dead center.
      ctx.font = `${Math.round(w * ACE_SYMBOL_SCALE)}px Arial, sans-serif`;
      ctx.fillText(sym, w / 2, h / 2);
    } else if (layouts[value]) {
      // Uniform pip size (~1 of the 3 middle columns wide), like real cards.
      const pipSize = Math.round(w * PIP_FONT_SCALE);
      ctx.font = `${pipSize}px Arial, sans-serif`;
      for (const [fx, fy] of layouts[value]) {
        const x = fx * w, y = fy * h;
        if (fy > 0.5) {
          // Pips in the bottom half print upside-down, matching real decks.
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI);
          ctx.fillText(sym, 0, 0); ctx.restore();
        } else {
          ctx.fillText(sym, x, y);
        }
      }
    } else {
      drawCourtArt(ctx, { x: 0, y: 0, width: w, height: h }, {
        rank: value, suitColor: color, suitSymbol: sym,
      }, this._cardArtLevel());
    }
  }

  flip() {
    if (!this.cardMesh || !this.gameObject) return;

    this.isFlipped = !this.isFlipped;
    const cardComponent = this.gameObject.getComponent('Card');
    if (cardComponent && this._renderSystem) {
      this.updateTexture(this.cardMesh, (context) => this.drawCard(context, cardComponent));
    }
  }

  update(deltaTime) {
    const cardComponent = this.gameObject.getComponent('Card');
    if (!cardComponent) return;
    if (this.holdLabel) {
      this.holdLabel.visible = cardComponent.held && cardComponent.faceUp;
      // The card had no parent yet if the mesh was created before the card
      // entered the scene — adopt the indicator into the scene once possible.
      if (this.holdLabel.parent === this.gameObject && this.gameObject.parent) {
        this.gameObject.parent.add(this.holdLabel);
      }
      // Scene-parented: follow the card's column; y stays on the bottom band.
      this.holdLabel.position.set(this.gameObject.position.x, LAYOUT.holdY, 0.02);
    }
  }

  handleClick(raycaster) {
    if (!this.cardMesh) return;

    const intersects = raycaster.intersectObject(this.cardMesh);
    if (intersects.length > 0) {
      const cardComponent = this.gameObject.getComponent('Card');
      if (cardComponent) {
        const gameManager = this.engine?.findGameObjectByName('GameManager')?.getComponent('GameManager');
        if (gameManager && gameManager.state === 'selecting') {
          // Route through GameManager.holdCard so clicks and hold buttons share
          // one path (which calls card.hold() once + plays sound + emits event).
          const index = gameManager.hand.indexOf(this.gameObject);
          if (index !== -1) gameManager.holdCard(index);
        }
      }
    }
  }
}

export default CardRenderComponent;
