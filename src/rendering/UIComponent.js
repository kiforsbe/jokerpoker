import RenderComponent from './RenderComponent.js';
import { GameAudioComponent } from '../audio/AudioComponent.js';
import GameLogger from '../utils/GameLogger.js';
import { getTheme, PALETTE, paintThemed, onThemeChanged, fillTextCentered } from './theme.js';

class UIComponent extends RenderComponent {
  constructor() {
    super();
    this.isInteractable = true;
    this.isHovered = false;
    this.onClick = null;
    this.audioComponent = null;
    this.normalColor = 0x666666;
    this.hoverColor = 0x888888;
    this.disabledColor = 0x444444;
    this.logger = new GameLogger();
  }

  get type() {
    return 'UI';
  }

  onAdd() {
    this.logger.log('DEBUG', `[${this.gameObject?.name}] UIComponent.onAdd() called`);
    super.onAdd();
    // this.audioComponent = this.gameObject.addComponent(new GameAudioComponent());
    
    // Debugging the render system availability
    if (this.engine) {
      this.logger.log('DEBUG', `[${this.gameObject?.name}] Engine available`);
      const renderSystem = this.engine.systems.get('render');
      this.logger.log('DEBUG', `[${this.gameObject?.name}] RenderSystem: ${renderSystem ? 'available' : 'not available'}`);
      this.logger.log('DEBUG', `[${this.gameObject?.name}] RenderSystem initialized: ${renderSystem?.initialized ? 'yes' : 'no'}`);
    } else {
      this.logger.log('DEBUG', `[${this.gameObject?.name}] Engine NOT available`);
    }
  }

  handleClick(raycaster) {
    if (!this.isInteractable) return false;

    const intersects = this.raycast(raycaster);
    if (intersects.length > 0) {
      if (this.audioComponent) {
        this.audioComponent.playButtonPress();
      }
      if (this.onClick) {
        this.onClick();
      }
      return true;
    }
    return false;
  }

  setInteractable(value) {
    this.isInteractable = value;
    if (this.meshes[0] && this.meshes[0].material) {
      this.meshes[0].material.color.setHex(value ? this.normalColor : this.disabledColor);
      this.meshes[0].material.opacity = value ? 1.0 : 0.5;
    }
  }

  checkHover(raycaster) {
    if (!this.isInteractable || !raycaster) return false;
    const intersects = this.raycast(raycaster);
    return intersects.length > 0;
  }

  update(deltaTime) {
    super.update(deltaTime);

    // Update hover state using raycaster from InputSystem
    if (!this.isInteractable || !this.meshes[0] || !this.meshes[0].material) {
      return;
    }

    const renderSystem = this._renderSystem;
    const inputSystem = this.engine?.systems.get('input');

    if (!renderSystem || !inputSystem) {
      return;
    }

    // Get normalized mouse position from input system
    const mousePos = inputSystem.getMouseNormalizedPosition();
    if (!mousePos) {
      // Reset hover state if mouse position isn't available
      if (this.isHovered) {
        this.isHovered = false;
        this.meshes[0].material.color.setHex(this.normalColor);
      }
      return;
    }

    const raycaster = renderSystem.createRaycaster(mousePos.x, mousePos.y);
    if (!raycaster) {
      return;
    }

    const isHoveredNow = this.checkHover(raycaster);
    if (isHoveredNow !== this.isHovered) {
      this.isHovered = isHoveredNow;
      this.meshes[0].material.color.setHex(
        isHoveredNow ? this.hoverColor : this.normalColor
      );
    }
  }
}

class ButtonComponent extends UIComponent {
  constructor(text = '', width = 0.4, height = 0.15) {
    super();
    this.text = text;
    this.width = width;
    this.height = height;
  }

  onRenderSystemReady() {
    // Now that _renderSystem is guaranteed to be available, create meshes
    this.logger.log('DEBUG', `[${this.gameObject?.name}] ButtonComponent.onRenderSystemReady() called`);
    
    if (!this._renderSystem) {
      this.logger.log('ERROR', `[${this.gameObject?.name}] Render system not ready in ButtonComponent`);
      return;
    }
    this.logger.log('DEBUG', `[${this.gameObject?.name}] ButtonComponent creating meshes with: width=${this.width}, height=${this.height}`);

    // Create button background with proper render order
    const buttonMesh = this.createRect(this.width, this.height, this.normalColor);
    buttonMesh.position.z = 0;
    buttonMesh.renderOrder = 3;
    buttonMesh.material.depthTest = false;
    buttonMesh.material.depthWrite = false;

    // Create button text with even higher render order
    const textMesh = this.createTextSprite(this.text, '#ffffff', 32);
    textMesh.position.z = 0.01;
    textMesh.renderOrder = 4;
    // Ensure text is always visible
    textMesh.material.depthTest = false;
    textMesh.material.depthWrite = false;
    // Adjust scale relative to the button size
    textMesh.scale.set(this.width * 0.8 / 1, this.height * 0.6 / 0.25, 1);
    
    // Debug output to check that meshes were properly created and added
    this.logger.log('DEBUG', `[${this.gameObject?.name}] ButtonComponent created ${this.meshes.length} meshes`);
    this.meshes.forEach((mesh, index) => {
      this.logger.log('DEBUG', `[${this.gameObject?.name}] Mesh ${index}: ${mesh ? 'Valid' : 'Invalid'}, Parent: ${mesh?.parent?.name || 'None'}`);
    });
  }

  setInteractable(value) {
    super.setInteractable(value);
    // Check if meshes exist before trying to access material
    if (this.meshes[0] && this.meshes[0].material) {
      this.meshes[0].material.color.setHex(
        value ? this.normalColor : this.disabledColor
      );
      // Ensure opacity is also set correctly
      this.meshes[0].material.opacity = value ? 1.0 : 0.5;
    }
    // Also update text opacity if needed (assuming text is mesh[1])
    if (this.meshes[1] && this.meshes[1].material) {
      this.meshes[1].material.opacity = value ? 1.0 : 0.5;
    }
  }
}

class TextDisplayComponent extends UIComponent {
  constructor(initialText = '', color = '#ffffff', size = 32) {
    super();
    this.text = initialText;
    this.color = color;
    this.size = size;
    this.isInteractable = false; // Text is usually not interactable
  }

  onAdd() {
    super.onAdd();
    // Don't create mesh here
  }

  onRenderSystemReady() {
    if (!this._renderSystem) {
      this.logger.log('ERROR', "Render system not ready in TextDisplayComponent");
      return;
    }
    
    // Create the initial text sprite mesh with proper render settings
    const textMesh = this.createTextSprite(this.text, this.color, this.size);
    textMesh.renderOrder = 5; // Ensure text is rendered on top
    textMesh.material.depthTest = false; // Ensure text is always visible
    textMesh.material.depthWrite = false;
  }

  setText(newText) {
    this.text = newText;
    // Ensure mesh exists and render system is ready before updating texture
    if (this.meshes[0] && this._renderSystem) {
      this.updateTexture(this.meshes[0], (context) => {
        context.fillStyle = this.color;
        context.font = `${this.size}px monospace`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(this.text, 128, 32); // Assuming 256x64 canvas from createTextSprite
      });
    } else if (!this.meshes[0]) {
      // Optionally queue the update or log a warning
      // console.warn("TextDisplayComponent: setText called before mesh was created.");
    }
  }

  update(deltaTime) {
    super.update(deltaTime);
  }
}

class StatusBoxComponent extends UIComponent {
  constructor(label, width = 0.62, height = 0.18) {
    super();
    this.label = label;
    this.value = '0';
    this.boxWidth = width;
    this.boxHeight = height;
    this.isInteractable = false;
    this._offTheme = null;
  }

  onRenderSystemReady() {
    if (!this._renderSystem) return;
    const texture = this._renderSystem.createCanvasTexture(320, 96,
      (ctx) => paintThemed(ctx, (c) => this._draw(c), this.boxWidth));
    const mesh = this.createSprite(texture, this.boxWidth, this.boxHeight);
    mesh.renderOrder = 5;
    this._offTheme = onThemeChanged(() => this._redraw());
  }

  // Gray box (on the top gray band) with the machine's double-line blue border.
  _draw(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = PALETTE.statusBg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PALETTE.statusBorder;
    const lw = Math.max(1, h * 0.05);
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
    const inset = h * 0.16;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.fillStyle = PALETTE.statusText;
    // All retro UI text must land on the same VT323 pixel size or glyphs
    // rasterize visibly differently between boxes, so the margins are wide
    // enough that "Credits 100" fits WITHOUT triggering the shrink loop
    // below. Shrinking remains only as an overflow guard for unusually
    // large values (e.g. four-digit credits).
    let px = Math.round(h * 0.48);
    const usable = w * 0.82; // width between the 9% text paddings
    const minGap = w * 0.05;
    ctx.font = getTheme().uiFont(px);
    while (px > 8 && ctx.measureText(this.label).width + ctx.measureText(this.value).width + minGap > usable) {
      px--;
      ctx.font = getTheme().uiFont(px);
    }
    // 'H' reference: label/value are caps and digits with no descenders,
    // so center their actual glyph band rather than the full font band.
    ctx.textAlign = 'left';
    fillTextCentered(ctx, this.label, w * 0.09, h * 0.5, 'H');
    ctx.textAlign = 'right';
    fillTextCentered(ctx, this.value, w * 0.91, h * 0.5, 'H');
  }

  _redraw() {
    if (this.meshes[0] && this._renderSystem) {
      this.updateTexture(this.meshes[0], (ctx) => paintThemed(ctx, (c) => this._draw(c), this.boxWidth));
    }
  }

  setValue(v) {
    this.value = String(v);
    this._redraw();
  }

  onRemove() {
    if (this._offTheme) { this._offTheme(); this._offTheme = null; }
    super.onRemove();
  }
}

// "Bet" as plain text with the value in a yellow oval — no box (per photos).
class BetDisplayComponent extends UIComponent {
  constructor(width = 0.62, height = 0.18) {
    super();
    this.value = '1';
    this.boxWidth = width;
    this.boxHeight = height;
    // Clickable: tapping the bet oval cycles the bet (onClick is wired in
    // UIFactory.createStatusBar). cycleBet itself guards the game state.
    this.isInteractable = true;
    // The texture already carries the real colors (yellow oval, black
    // text) — the default button tint of 0x666666 would multiply them
    // into a muddy brown. Stay white; dim a touch on hover as feedback.
    this.normalColor = 0xffffff;
    this.hoverColor = 0xdddddd;
    this._offTheme = null;
  }

  onRenderSystemReady() {
    if (!this._renderSystem) return;
    const texture = this._renderSystem.createCanvasTexture(320, 96,
      (ctx) => paintThemed(ctx, (c) => this._draw(c), this.boxWidth));
    const mesh = this.createSprite(texture, this.boxWidth, this.boxHeight);
    mesh.renderOrder = 5;
    this._offTheme = onThemeChanged(() => this._redraw());
  }

  _draw(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.font = getTheme().uiFont(Math.round(h * 0.48));
    // 'H' reference: "Bet" and the value have no descenders, so center
    // their actual glyph band rather than the full font band.
    ctx.fillStyle = PALETTE.betLabelText;
    ctx.textAlign = 'left';
    fillTextCentered(ctx, 'Bet', w * 0.14, h * 0.5, 'H');
    // Yellow oval with the bet value.
    const cx = w * 0.62, cy = h * 0.5;
    ctx.fillStyle = PALETTE.betOval;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.13, h * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.betText;
    ctx.textAlign = 'center';
    fillTextCentered(ctx, this.value, cx, cy, 'H');
  }

  _redraw() {
    if (this.meshes[0] && this._renderSystem) {
      this.updateTexture(this.meshes[0], (ctx) => paintThemed(ctx, (c) => this._draw(c), this.boxWidth));
    }
  }

  setValue(v) {
    this.value = String(v);
    this._redraw();
  }

  onRemove() {
    if (this._offTheme) { this._offTheme(); this._offTheme = null; }
    super.onRemove();
  }
}

export { UIComponent, ButtonComponent, TextDisplayComponent, StatusBoxComponent, BetDisplayComponent };
