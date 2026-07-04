import GameLogger from '../utils/GameLogger.js';
import RenderComponent from '../rendering/RenderComponent.js';

class InputSystem {
  constructor(engine) {
    this.engine = engine;
    this._renderSystem = null;
    this._mousePosition = { x: 0, y: 0 };
    this._isPointerDown = false;
    this._pointerDownPosition = { x: 0, y: 0 };
    this._clickOccurred = false;
    this._clickPosition = { x: 0, y: 0 };
    this.enabled = false;
    this.logger = new GameLogger();

    // Bind event handlers to maintain 'this' context
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);

    this.logger.log('DEBUG', 'InputSystem: Created with initial settings', {
      enabled: this.enabled
    });
  }

  init(engine) {
    this.engine = engine;
    this.logger.log('DEBUG', 'InputSystem: Initialized');
  }

  enable() {
    if (this.enabled) return;

    this.enabled = true;
    window.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointermove', this._onPointerMove);

    this.logger.log('DEBUG', 'InputSystem: Enabled', {
      listenerCount: 3
    });
  }

  disable() {
    if (!this.enabled) return;

    this.enabled = false;
    this._isPointerDown = false;
    this._clickOccurred = false;
    window.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointermove', this._onPointerMove);

    this.logger.log('DEBUG', 'InputSystem: Disabled');
  }

  update(deltaTime) {
    if (!this.enabled) return;

    if (!this._renderSystem) {
      this._renderSystem = this.engine.systems.get('render');
      if (!this._renderSystem) return;
    }

    const scene = this._renderSystem.activeScene;
    if (!scene || !scene.camera) return;

    if (this._clickOccurred) {
      const ndc = this._toNDC(this._clickPosition.x, this._clickPosition.y);
      const raycaster = this._renderSystem.createRaycaster(ndc.x, ndc.y);
      if (raycaster) this._dispatchClick(raycaster);
      this._clickOccurred = false;
    }
  }

  // Client coordinates to normalized device coordinates relative to the
  // game canvas. The canvas is letterboxed inside the window, so window-based
  // NDC would skew every raycast; measure against the canvas rect instead.
  _toNDC(clientX, clientY) {
    const canvas = this._renderSystem?.renderer?.domElement;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: ((clientX - rect.left) / rect.width) * 2 - 1,
          y: -((clientY - rect.top) / rect.height) * 2 + 1
        };
      }
    }
    return {
      x: (clientX / window.innerWidth) * 2 - 1,
      y: -(clientY / window.innerHeight) * 2 + 1
    };
  }

  _dispatchClick(raycaster) {
    const scene = this._renderSystem.activeScene;
    let nearest = null;
    scene.traverse(obj => {
      if (!obj.components || obj.visible === false) return;
      for (const comp of obj.components.values()) {
        if (typeof comp.handleClick !== 'function' || !Array.isArray(comp.meshes)) continue;
        // Skip components that just inherit RenderComponent's no-op handleClick.
        // Otherwise a purely decorative sprite (win text, paytable, etc.) that
        // happens to share a z-depth with a card can win the nearest-hit tie
        // and silently swallow clicks meant for the card underneath it.
        if (comp.handleClick === RenderComponent.prototype.handleClick) continue;
        for (const mesh of comp.meshes) {
          if (!mesh || !mesh.visible) continue;
          const hits = raycaster.intersectObject(mesh, false);
          if (hits.length && (!nearest || hits[0].distance < nearest.distance)) {
            nearest = { distance: hits[0].distance, comp };
          }
        }
      }
    });
    if (nearest) nearest.comp.handleClick(raycaster);
  }

  _onPointerDown(event) {
    if (!this.enabled) return;

    this._isPointerDown = true;
    this._pointerDownPosition.x = event.clientX;
    this._pointerDownPosition.y = event.clientY;

    this.logger.log('DEBUG', 'InputSystem: Pointer down', {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      pressure: event.pressure
    });
  }

  _onPointerUp(event) {
    if (!this.enabled || !this._isPointerDown) return;

    const dx = event.clientX - this._pointerDownPosition.x;
    const dy = event.clientY - this._pointerDownPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Consider it a click if movement was minimal
    if (distance < 10) {
      this._clickOccurred = true;
      this._clickPosition.x = event.clientX;
      this._clickPosition.y = event.clientY;

      this.logger.log('DEBUG', 'InputSystem: Click detected', {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        movementDistance: distance.toFixed(2)
      });
    }

    this._isPointerDown = false;
  }

  _onPointerMove(event) {
    if (!this.enabled) return;

    this._mousePosition.x = event.clientX;
    this._mousePosition.y = event.clientY;
  }

  getPointerPosition() {
    return { ...this._mousePosition };
  }

  getNormalizedPointerPosition() {
    // Computed on demand rather than in the move handler: the render system
    // (and thus the canvas rect) may not exist yet when the pointer first moves.
    return this._toNDC(this._mousePosition.x, this._mousePosition.y);
  }

  // Alias expected by UIComponent.
  getMouseNormalizedPosition() {
    return this.getNormalizedPointerPosition();
  }

  isPointerDown() {
    return this._isPointerDown;
  }

  hasClick() {
    return this._clickOccurred;
  }

  getClickPosition() {
    return { ...this._clickPosition };
  }
}

export default InputSystem;
