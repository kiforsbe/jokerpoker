import * as THREE from 'three';
import RenderComponent from './RenderComponent.js';
import { getTheme, paintThemed, onThemeChanged, fillTextCentered, PALETTE, LAYOUT } from './theme.js';

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
export const CARD_WORLD_WIDTH = 0.30;
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
  backEdge: '#f5f5ee',
  backPanel: '#b3271a',
  backLattice: 'rgba(255,255,255,0.30)',
  backOutline: '#ffffff',
  courtPanelRed: '#fbeaea',
  courtPanelBlack: '#eceef4',
  jokerText: '#7a2fb0',
};

// All fractions below are of the canvas width (w) or height (h) unless noted.

// Card shape.
const CARD_CORNER_RADIUS_SCALE = 0.09;

// Card back design.
const BACK_INSET_SCALE = 0.05;
const BACK_PANEL_RADIUS_RATIO = 0.7; // fraction of the outer corner radius
const HAIRLINE_WIDTH_SCALE = 0.012; // shared by the back lattice and front border
const BACK_LATTICE_MIN_WIDTH = 1;
const BACK_LATTICE_SPACING_SCALE = 0.11;
const BACK_OUTLINE_MIN_WIDTH = 2;
const BACK_OUTLINE_WIDTH_SCALE = 0.02;

// Card back center motif: white mini-panel with a club, per the photos.
const BACK_MOTIF_PANEL_WIDTH_SCALE = 0.34;
const BACK_MOTIF_PANEL_HEIGHT_SCALE = 0.30; // of card height
const BACK_MOTIF_PANEL_RADIUS_SCALE = 0.03;
const BACK_MOTIF_CLUB_SCALE = 0.22;

// Card front border.
const FRONT_BORDER_MIN_WIDTH = 1.5;

// Draws the card back (warm white edge, red lattice panel, club motif)
// filling the given context's canvas. Shared by face-down cards and the
// deck stack (DeckRenderComponent).
export function drawCardBack(ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const radius = w * CARD_CORNER_RADIUS_SCALE;
  const roundRect = (x, y, rw, rh, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, r);
    ctx.arcTo(x + rw, y + rh, x, y + rh, r);
    ctx.arcTo(x, y + rh, x, y, r);
    ctx.arcTo(x, y, x + rw, y, r);
    ctx.closePath();
  };

  // Outer edge: the full card, off-white.
  roundRect(0, 0, w, h, radius);
  ctx.fillStyle = COLORS.backEdge;
  ctx.fill();

  // Inner panel: red rect inset from the edge.
  const inset = w * BACK_INSET_SCALE;
  const ir = radius * BACK_PANEL_RADIUS_RATIO;
  roundRect(inset, inset, w - inset * 2, h - inset * 2, ir);
  ctx.fillStyle = COLORS.backPanel;
  ctx.fill();

  // Diagonal crosshatch lattice, clipped to the inner panel so the
  // lines don't spill onto the white edge.
  ctx.save();
  roundRect(inset, inset, w - inset * 2, h - inset * 2, ir);
  ctx.clip();
  ctx.strokeStyle = COLORS.backLattice;
  ctx.lineWidth = Math.max(BACK_LATTICE_MIN_WIDTH, w * HAIRLINE_WIDTH_SCALE);
  const step = w * BACK_LATTICE_SPACING_SCALE;
  for (let d = -h; d < w + h; d += step) {
    ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + h, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(d, h); ctx.lineTo(d + h, 0); ctx.stroke();
  }
  ctx.restore();

  // Central white mini-panel with a club motif (all reference photos).
  const pw = w * BACK_MOTIF_PANEL_WIDTH_SCALE;
  const ph = h * BACK_MOTIF_PANEL_HEIGHT_SCALE;
  roundRect((w - pw) / 2, (h - ph) / 2, pw, ph, w * BACK_MOTIF_PANEL_RADIUS_SCALE);
  ctx.fillStyle = COLORS.backEdge;
  ctx.fill();
  ctx.strokeStyle = COLORS.backPanel;
  ctx.lineWidth = Math.max(BACK_LATTICE_MIN_WIDTH, w * HAIRLINE_WIDTH_SCALE);
  ctx.stroke();
  ctx.fillStyle = COLORS.backPanel;
  ctx.font = `${Math.round(w * BACK_MOTIF_CLUB_SCALE)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♣', w / 2, h / 2);

  // White outline retracing the inner panel, on top of the lattice.
  roundRect(inset, inset, w - inset * 2, h - inset * 2, ir);
  ctx.strokeStyle = COLORS.backOutline;
  ctx.lineWidth = Math.max(BACK_OUTLINE_MIN_WIDTH, w * BACK_OUTLINE_WIDTH_SCALE);
  ctx.stroke();
}

// Corner index (rank + suit tucked in the corner).
const CORNER_INDEX_X_SCALE = 1 / 7; // centered in columns 1-2 of a 7-column model
const CORNER_INDEX_RANK_Y_SCALE = 0.13;
const CORNER_INDEX_SUIT_Y_SCALE = 0.30;

// Joker.
const JOKER_STAR_SCALE = 0.36;
const JOKER_TEXT_SCALE = 0.16;

// Ace: a single modest center pip, per the photos.
const ACE_SYMBOL_SCALE = 0.32;

// Face card (J/Q/K) court panel.
const COURT_PANEL_X_SCALE = 0.27;
const COURT_PANEL_Y_SCALE = 0.20;
const COURT_PANEL_WIDTH_SCALE = 0.46;
const COURT_PANEL_HEIGHT_SCALE = 0.60;
const COURT_PANEL_RADIUS_SCALE = 0.04;
const COURT_PANEL_BORDER_MIN_WIDTH = 2;
const COURT_PANEL_BORDER_SCALE = 0.016;
const COURT_LETTER_SCALE = 0.42;
const COURT_LETTER_Y_SCALE = 0.42;
const COURT_SUIT_SCALE = 0.46;
const COURT_SUIT_Y_SCALE = 0.67;

class CardRenderComponent extends RenderComponent {
  constructor() {
    super();
    this.cardMesh = null;
    this.isFlipped = false;
    // Base unit for card size. Hand slots are 0.42 world units apart
    // (Game._handSlot), so 0.30 leaves a 0.12 gap between neighbors.
    // (Kept in sync with CARD_WORLD_WIDTH above, which sizes the hold box.)
    this.CARD_WIDTH = CARD_WORLD_WIDTH;
    this.CARD_HEIGHT = this.CARD_WIDTH * 1.4; // Maintains 2.5:3.5 ratio
    this._offTheme = null;
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
    if (this._offTheme) { this._offTheme(); this._offTheme = null; }
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

    const texture = this._renderSystem.createCanvasTexture(CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT, (context) => {
      paintThemed(context, (ctx) => this.drawCard(ctx, cardComponent), this.CARD_WIDTH);
    });

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
    const holdTexture = this._renderSystem.createCanvasTexture(HOLD_TEXTURE_WIDTH, HOLD_TEXTURE_HEIGHT, (ctx) => {
      paintThemed(ctx, (c) => this._drawHoldLabel(c), HOLD_WORLD_WIDTH);
    });
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

    this._offTheme = onThemeChanged(() => {
      const card = this.gameObject?.getComponent('Card');
      if (!card || !this._renderSystem) return;
      if (this.cardMesh) {
        this.updateTexture(this.cardMesh, (context) => {
          paintThemed(context, (ctx) => this.drawCard(ctx, card), this.CARD_WIDTH);
        });
      }
      if (this.holdLabel) {
        this.updateTexture(this.holdLabel, (ctx) => {
          paintThemed(ctx, (c) => this._drawHoldLabel(c), this.CARD_WIDTH);
        });
      }
    });
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
    ctx.font = getTheme().uiFont(Math.round(h * 0.55));
    ctx.textAlign = 'center';
    fillTextCentered(ctx, 'hold', w / 2, h / 2);
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
      drawCardBack(ctx);
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
    // bottom-right (rotated). "10" gets a smaller font so it stays in its column. ----
    const idxText = value === '10' ? '10' : (value === 'Joker' ? '★' : value.charAt(0));
    const idxFont = Math.round(w * RANK_GLYPH_SCALE);
    const cornerX = w * CORNER_INDEX_X_SCALE;
    const drawIndex = () => {
      // Rank value
      ctx.font = getTheme().cardFont(idxFont);
      const valW = ctx.measureText(idxText).width;
      ctx.fillText(idxText, cornerX, h * CORNER_INDEX_RANK_Y_SCALE);
      // Suit, sized so its glyph width matches the rank width (capped at the rank
      // font so a wide "10" doesn't blow it up).
      let suitFont = idxFont;
      ctx.font = getTheme().cardFont(suitFont);
      const suitW = ctx.measureText(sym).width;
      suitFont = Math.min(idxFont, suitFont * (valW / suitW));
      ctx.font = getTheme().cardFont(Math.round(suitFont));
      ctx.fillText(sym, cornerX, h * CORNER_INDEX_SUIT_Y_SCALE);
    };
    drawIndex(); // top-left, as drawn
    ctx.save();
    // Flip the canvas 180° around its center so the same drawIndex() call
    // lands in the bottom-right corner, rotated to read correctly upside-down.
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    drawIndex();
    ctx.restore();

    // ---- Joker ----
    if (value === 'Joker') {
      // Large centered star...
      ctx.fillStyle = color;
      ctx.font = `${Math.round(w * JOKER_STAR_SCALE)}px Arial, sans-serif`;
      ctx.fillText('★', w / 2, h / 2);
      // ...with "JOKER" banked vertically through the middle of it.
      ctx.fillStyle = COLORS.jokerText;
      ctx.font = `bold ${Math.round(w * JOKER_TEXT_SCALE)}px Arial, sans-serif`;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('JOKER', 0, 0);
      ctx.restore();
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
      if (getTheme().pixelCourts) {
        // ---- Face cards J / Q / K: mirrored pixel-art figure (retro) ----
        this.drawPixelCourt(ctx, w, h, value);
      } else {
        // ---- Face cards J / Q / K: framed court panel (hires) ----
        // Panel: rounded rect centered on the card, filled with a tinted
        // background and outlined in the suit color.
        const ix = w * COURT_PANEL_X_SCALE, iy = h * COURT_PANEL_Y_SCALE;
        const iw = w * COURT_PANEL_WIDTH_SCALE, ih = h * COURT_PANEL_HEIGHT_SCALE;
        roundRect(ix, iy, iw, ih, w * COURT_PANEL_RADIUS_SCALE);
        ctx.fillStyle = red ? COLORS.courtPanelRed : COLORS.courtPanelBlack;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(COURT_PANEL_BORDER_MIN_WIDTH, w * COURT_PANEL_BORDER_SCALE);
        ctx.stroke();
        // Big serif letter (J/Q/K) upper-middle of the panel...
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.round(w * COURT_LETTER_SCALE)}px Georgia, "Times New Roman", serif`;
        ctx.fillText(value, w / 2, h * COURT_LETTER_Y_SCALE);
        // ...with the suit symbol underneath it.
        ctx.font = `${Math.round(w * COURT_SUIT_SCALE)}px Arial, sans-serif`;
        ctx.fillText(sym, w / 2, h * COURT_SUIT_Y_SCALE);
      }
    }
  }

  // Procedural pixel-art court figures for retro mode. Each grid is the TOP
  // half of the figure (15 columns); the bottom half is the mirror image, as
  // on real court cards. This is an approximation of the machine's art.
  static get COURT_PIXELS() {
    // Palette keys: Y gold, B blue, R red, S skin, K black, W white, '.' empty.
    return {
      K: [ // crown
        '...Y.Y.Y.Y.Y...',
        '...YYYYYYYYY...',
        '...SSSSSSSSS...',
        '...SKSSSSSKS...',
        '...SSSSSSSSS...',
        '....SSKKKSS....',
        '..RRRRRRRRRRR..',
        '.RRRBBBBBBBRRR.',
        '.RRBBBYBYBBBRR.',
        '.RRBBYBBBYBBRR.',
        '.RRBBBYBYBBBRR.',
        '.RRBBBBBBBBBRR.',
        'YYRRBBBBBBBRRYY',
        'YYRRRRRRRRRRRYY',
      ],
      Q: [ // hair and small crown
        '.....YYYYY.....',
        '..KKKYYYYYKKK..',
        '..KKSSSSSSSKK..',
        '..KKSKSSSKSKK..',
        '..KKSSSSSSSKK..',
        '...KSSKKKSSK...',
        '..BBBBBBBBBBB..',
        '.BBBRRRRRRRBBB.',
        '.BBRRYRYRYRRBB.',
        '.BBRRRRRRRRRBB.',
        '.BBRRYRRRYRRBB.',
        '.BBRRRRRRRRRBB.',
        'WWBBRRRRRRRBBWW',
        'WWBBBBBBBBBBBWW',
      ],
      J: [ // cap
        '....RRRRRRR....',
        '...RRYYYYYRR...',
        '...SSSSSSSSS...',
        '...SKSSSSSKS...',
        '...SSSSSSSSS...',
        '....SSKKKSS....',
        '..YYYYYYYYYYY..',
        '.YYYBBBBBBBYYY.',
        '.YYBBRBRBRBBYY.',
        '.YYBBBBBBBBBYY.',
        '.YYBBRBBBRBBYY.',
        '.YYBBBBBBBBBYY.',
        'BBYYBBBBBBBYYBB',
        'BBYYYYYYYYYYYBB',
      ],
    };
  }

  drawPixelCourt(ctx, w, h, value) {
    const PALETTE_MAP = {
      Y: '#e8c040', B: '#2848c0', R: '#c81414', S: '#f0c8a0',
      K: '#1a1a1a', W: '#ffffff',
    };
    const grid = CardRenderComponent.COURT_PIXELS[value];
    if (!grid) return;
    const cols = 15;
    const panelX = w * 0.16, panelW = w * 0.68;
    const panelY = h * 0.18, panelH = h * 0.64;
    const cell = panelW / cols;
    const rows = grid.length;
    // Rows fill the top half of the panel; the mirror fills the bottom half.
    const rowH = (panelH / 2) / rows;
    const drawHalf = () => {
      for (let r = 0; r < rows; r++) {
        const line = grid[r];
        for (let c = 0; c < cols; c++) {
          const color = PALETTE_MAP[line[c]];
          if (!color) continue;
          // +/- 0.5px overdraw hides seams between cells after the blit.
          ctx.fillStyle = color;
          ctx.fillRect(panelX + c * cell - 0.5, r * rowH - 0.5, cell + 1, rowH + 1);
        }
      }
    };
    // Top half.
    ctx.save();
    ctx.translate(0, panelY);
    drawHalf();
    ctx.restore();
    // Bottom half: mirrored vertically around the panel center.
    ctx.save();
    ctx.translate(0, panelY + panelH);
    ctx.scale(1, -1);
    drawHalf();
    ctx.restore();
    // Center divider, like real mirrored courts.
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(1, w * 0.006);
    ctx.beginPath();
    ctx.moveTo(panelX, panelY + panelH / 2);
    ctx.lineTo(panelX + panelW, panelY + panelH / 2);
    ctx.stroke();
  }

  flip() {
    if (!this.cardMesh || !this.gameObject) return;

    this.isFlipped = !this.isFlipped;
    const cardComponent = this.gameObject.getComponent('Card');
    if (cardComponent && this._renderSystem) {
      this.updateTexture(this.cardMesh, (context) => {
        paintThemed(context, (ctx) => this.drawCard(ctx, cardComponent), this.CARD_WIDTH);
      });
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
