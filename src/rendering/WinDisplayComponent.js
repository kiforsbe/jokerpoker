import * as THREE from 'three';
import { RenderComponent } from './RenderComponent.js';
import GameObject from '../engine/GameObject.js';
import GameLogger from '../utils/GameLogger.js';
import { getTheme, paintThemed, fillTextCentered, textureFilter } from './theme.js';

// World-space sprite size (orthographic units); width feeds the retro pixel grid.
const WIN_WORLD_WIDTH = 0.5;
const WIN_WORLD_HEIGHT = 0.15;

class WinDisplayComponent extends RenderComponent {
  constructor() {
    super();
    this.currentValue = 0;
    this.targetValue = 0;
    this.lastTickValue = 0;
    this.isAnimating = false;
    this.animationSpeed = 2.0; // Credits per second
    this.animationDuration = 1.5; // Maximum animation time in seconds
    this.pulseDuration = 0.5; // Pulse animation duration
    this.text = ''; 
    this.onComplete = null;
    this.logger = new GameLogger();
  }

  get type() {
    return 'WinDisplay';
  }

  onRenderSystemReady() {
    if (!this._renderSystem) return;
    
    // Create text mesh
    const texture = this._renderSystem.createCanvasTexture(256, 64, this.drawText.bind(this));
    const mesh = this.createSprite(texture, WIN_WORLD_WIDTH, WIN_WORLD_HEIGHT);
    mesh.renderOrder = 10; // Ensure it renders on top of other elements
    
    // Set material properties
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
    mesh.material.transparent = true;
  }

  drawText(context) {
    paintThemed(context, (ctx) => {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      ctx.fillStyle = '#ffff00';
      ctx.font = getTheme().uiFont(Math.round(h * 0.5));
      ctx.textAlign = 'center';
      fillTextCentered(ctx, this.text, w / 2, h / 2);
    }, WIN_WORLD_WIDTH);
  }

  setText(text) {
    if (this.text === text) return;
    
    this.text = text;
    this.updateTexture();
  }

  updateTexture() {
    if (!this.meshes[0] || !this.meshes[0].material.map) return;
    
    const texture = this.meshes[0].material.map;
    const canvas = texture.image;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    this.drawText(context);
    texture.minFilter = texture.magFilter = textureFilter();
    texture.needsUpdate = true;
  }

  showWin(amount, onComplete = null) {
    this.targetValue = amount;
    this.currentValue = 0;
    this.lastTickValue = 0;
    this.isAnimating = true;
    this.onComplete = onComplete;
    
    // Show initial value
    this.setText(`WIN: ${Math.floor(this.currentValue)}`);
    
    // Reset scale
    if (this.meshes[0]) {
      this.meshes[0].scale.set(1, 1, 1);
    }
  }

  update(deltaTime) {
    if (!this.isAnimating) return;
    
    // Update value animation
    if (this.currentValue < this.targetValue) {
      // Calculate how much to increment this frame
      const targetDuration = Math.min(this.animationDuration, this.targetValue / this.animationSpeed);
      const increment = Math.min(
        deltaTime * (this.targetValue / targetDuration),
        this.targetValue - this.currentValue
      );
      
      this.currentValue += increment;
      
      // Only update text if integer value has changed
      const currentIntValue = Math.floor(this.currentValue);
      if (currentIntValue !== this.lastTickValue) {
        this.lastTickValue = currentIntValue;
        this.setText(`WIN: ${currentIntValue}`);
        
        // Apply pulse effect on each tick
        if (this.meshes[0]) {
          this.meshes[0].scale.set(1.2, 1.2, 1);
        }
      }
      
      // Animate scale back to normal
      if (this.meshes[0] && this.meshes[0].scale.x > 1) {
        const scaleDecrement = (0.2 / this.pulseDuration) * deltaTime;
        const newScale = Math.max(1, this.meshes[0].scale.x - scaleDecrement);
        this.meshes[0].scale.set(newScale, newScale, 1);
      }
      
      // Check if we've reached the target
      if (this.currentValue >= this.targetValue) {
        this.currentValue = this.targetValue;
        this.setText(`WIN: ${Math.floor(this.currentValue)}`);
        
        // Final pulse
        if (this.meshes[0]) {
          this.meshes[0].scale.set(1.5, 1.5, 1);
        }
        
        // Delay completion callback to allow final pulse to be visible
        setTimeout(() => {
          this.isAnimating = false;
          if (this.onComplete) {
            const callback = this.onComplete;
            this.onComplete = null;
            callback();
          }
        }, this.pulseDuration * 1000);
      }
    }
  }

  reset() {
    this.currentValue = 0;
    this.targetValue = 0;
    this.lastTickValue = 0;
    this.isAnimating = false;
    this.setText(''); // Clear text using inherited method
    if (this.meshes[0]) {
      this.meshes[0].scale.set(1, 1, 1); // Reset scale
    }
    this.onComplete = null;
  }
}

// Factory function to create win display
export function createWinDisplay(x = 0, y = 0) {
  const winDisplayObject = new GameObject('WinDisplay');
  winDisplayObject.addComponent(new WinDisplayComponent());
  winDisplayObject.position.set(x, y, 0);
  return winDisplayObject;
}

export { WinDisplayComponent };