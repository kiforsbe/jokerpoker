import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CRTShader } from './shaders/CRTShader.js';
import { OutlineShader } from './shaders/OutlineShader.js';
import { textureFilter, SCREEN_ASPECT } from './theme.js';
import GameLogger from '../utils/GameLogger.js';

const DebugRenderMode = {
  NONE: 'NONE',
  WIREFRAME: 'WIREFRAME',
  EDGES: 'EDGES',
};

class RenderSystem {
  constructor(engine) {
    this.engine = engine;
    this.logger = new GameLogger();
    
    // Three.js core components
    this.renderer = null;
    this.activeScene = null;

    // Post-processing
    this.composer = null;
    this.renderPass = null;
    this.outlinePass = null;
    this.crtPass = null;
    this.depthTexture = null;

    // Rendering flags
    this.initialized = false;
    this.useComposer = true;
    this.useOutlineEffect = true;
    this.useCRTEffect = true;

    // Debug options
    this.debugRenderMode = DebugRenderMode.NONE;
    this._wireframeMaterial = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0x00ff00,
      depthTest: false
    });
    this._originalMaterials = new Map();

    // Event handlers
    this._contextLostHandler = this._handleContextLost.bind(this);
    this._contextRestoredHandler = this._handleContextRestored.bind(this);
    
    // Initial shader parameters
    this.shaderParams = {
      crt: {
        enabled: true,
        scanlineCount: 800.0,
        scanlineIntensity: 0.15,
        noise: 0.02,
        flicker: 0.01,
        vignetteIntensity: 0.3,
        curvature: new THREE.Vector2(2.0, 2.0)
      },
      outline: {
        enabled: true,
        color: new THREE.Color(0x00ff00),
        thickness: 1.5,
        depthSensitivity: 0.05
      }
    };
  }

  get type() {
    return 'RenderSystem';
  }

  setActiveScene(scene) {
    this.activeScene = scene;

    // Ensure we have both scene and camera before setting up render pass
    if (scene && scene.camera) {
      if (this.renderPass) {
        this.renderPass.scene = scene;
        this.renderPass.camera = scene.camera;
      }

      // Update composer if it exists
      if (this.composer) {
        this.composer.reset();

        // Re-add passes in the correct order
        if (this.renderPass) this.composer.addPass(this.renderPass);
        if (this.outlinePass) this.composer.addPass(this.outlinePass);
        if (this.crtPass) this.composer.addPass(this.crtPass);
      }

      this.logger.log('DEBUG', 'RenderSystem: Active scene set', {
        sceneName: scene.name,
        hasCamera: !!scene.camera
      });
    } else {
      this.logger.log('WARN', 'RenderSystem: Incomplete scene setup', {
        hasScene: !!scene,
        hasCamera: !!(scene && scene.camera)
      });
    }
  }

  _handleContextLost(event) {
    console.error('RenderSystem: WebGL context lost!', event);
    event.preventDefault();
    if (this.engine) {
      this.engine.isRunning = false;
    }
  }

  _handleContextRestored(event) {
    console.warn("RenderSystem: WebGL context restored. Manual game restart needed.");
  }

  async init() {
    if (this.initialized) {
      this.logger.log('WARN', 'RenderSystem: Already initialized');
      return;
    }

    this.logger.log('DEBUG', 'RenderSystem: Starting initialization');

    try {
      // Dispose of any existing renderer first
      if (this.renderer) {
        this.logger.log('DEBUG', 'RenderSystem: Disposing existing renderer');
        
        // Remove event listeners
        this.renderer.domElement.removeEventListener('webglcontextlost', this._contextLostHandler);
        this.renderer.domElement.removeEventListener('webglcontextrestored', this._contextRestoredHandler);
        
        // Remove from DOM if it exists
        if (this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        
        // Dispose renderer
        this.renderer.dispose();
        this.renderer = null;
      }

      // Setup renderer
      this.renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "high-performance",
        alpha: false,
        debug: true
      });

      this.renderer.setClearColor(0x000022, 1);
      const { width, height } = this._fitScreenSize();
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(this._pixelRatio());
      this.renderer.autoClear = true;

      // Add an ID to the canvas for easier identification
      this.renderer.domElement.id = 'game-canvas';
      const host = document.getElementById('game-area') || document.body;
      host.appendChild(this.renderer.domElement);

      // Setup context handlers
      this.renderer.domElement.addEventListener('webglcontextlost', this._contextLostHandler, false);
      this.renderer.domElement.addEventListener('webglcontextrestored', this._contextRestoredHandler, false);

      // Setup depth texture for effects
      this.depthTexture = new THREE.DepthTexture();
      this.depthTexture.format = THREE.DepthFormat;
      this.depthTexture.type = THREE.UnsignedShortType;

      await this.setupPostprocessing();

      this.initialized = true;

      this.logger.log('DEBUG', 'RenderSystem: Successfully initialized', {
        renderer: {
          antialias: false,
          pixelRatio: window.devicePixelRatio,
          size: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        },
        shaderParams: this.shaderParams
      });

    } catch (error) {
      this.logger.log('ERROR', 'RenderSystem: Initialization failed', { error: error.message });
      throw error;
    }
  }

  async setupPostprocessing() {
    if (!this.renderer) {
      this.logger.log('WARN', 'RenderSystem: Renderer not initialized, cannot set up post-processing');
      return;
    }

    try {
      this.logger.log('DEBUG', 'RenderSystem: Setting up post-processing');

      // Clean up existing resources
      if (this.composer) {
        this.composer.renderTarget1?.dispose();
        this.composer.renderTarget2?.dispose();
        this.composer.dispose();
        this.composer = null;
      }
      if (this.renderPass) {
        this.renderPass.dispose();
        this.renderPass = null;
      }
      if (this.outlinePass) {
        this.outlinePass.dispose();
        this.outlinePass = null;
      }
      if (this.crtPass) {
        this.crtPass.dispose();
        this.crtPass = null;
      }

      const size = this.renderer.getSize(new THREE.Vector2());
      const pixelRatio = this.renderer.getPixelRatio();

      // Create render targets with matching format
      const renderTarget1 = new THREE.WebGLRenderTarget(
        size.width * pixelRatio,
        size.height * pixelRatio,
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          //encoding: THREE.sRGBEncoding,
          depthBuffer: true,
          stencilBuffer: false,
          depthTexture: this.depthTexture,
          generateMipmaps: false,
          samples: 0 // Important for compatibility
        }
      );
      
      const renderTarget2 = renderTarget1.clone();

      // Create composer with shared render targets
      this.composer = new EffectComposer(this.renderer);
      this.composer.renderTarget1 = renderTarget1;
      this.composer.renderTarget2 = renderTarget2;
      
      // Add main render pass first
      this.renderPass = new RenderPass(this.activeScene, this.activeScene?.camera);
      this.renderPass.clear = true; // Important!
      this.renderPass.clearDepth = true;
      this.composer.addPass(this.renderPass);

      // Set up outline pass
      this.outlinePass = new ShaderPass(OutlineShader);
      this.outlinePass.uniforms.resolution.value.set(size.width * pixelRatio, size.height * pixelRatio);
      this.outlinePass.uniforms.cameraNear.value = this.activeScene?.camera?.near || 0.1;
      this.outlinePass.uniforms.cameraFar.value = this.activeScene?.camera?.far || 100;
      this.outlinePass.uniforms.tDepth.value = this.depthTexture;
      this.outlinePass.uniforms.outlineColor.value = this.shaderParams.outline.color;
      this.outlinePass.uniforms.outlineThickness.value = this.shaderParams.outline.thickness;
      this.outlinePass.uniforms.depthSensitivity.value = this.shaderParams.outline.depthSensitivity;
      this.outlinePass.enabled = this.shaderParams.outline.enabled;
      this.composer.addPass(this.outlinePass);

      // Set up CRT pass last
      this.crtPass = new ShaderPass(CRTShader);
      this.crtPass.uniforms.resolution.value.set(size.width * pixelRatio, size.height * pixelRatio);
      this.crtPass.uniforms.time.value = 0;
      this.crtPass.uniforms.scanlineCount.value = this.shaderParams.crt.scanlineCount;
      this.crtPass.uniforms.scanlineIntensity.value = this.shaderParams.crt.scanlineIntensity;
      this.crtPass.uniforms.noise.value = this.shaderParams.crt.noise;
      this.crtPass.uniforms.flicker.value = this.shaderParams.crt.flicker;
      this.crtPass.uniforms.vignetteIntensity.value = this.shaderParams.crt.vignetteIntensity;
      this.crtPass.uniforms.curvature.value.copy(this.shaderParams.crt.curvature);
      this.crtPass.enabled = this.shaderParams.crt.enabled;
      this.composer.addPass(this.crtPass);

      // Ensure last pass renders to screen
      if (this.crtPass) {
        this.crtPass.renderToScreen = true;
      } else if (this.outlinePass) {
        this.outlinePass.renderToScreen = true;
      } else {
        this.renderPass.renderToScreen = true;
      }

      this.logger.log('DEBUG', 'RenderSystem: Post-processing setup complete', {
        size: `${size.width}x${size.height}`,
        pixelRatio,
        passes: ['render', 'outline', 'crt']
      });

    } catch (error) {
      this.logger.log('ERROR', 'RenderSystem: Post-processing setup failed', { error: error.message });
      console.error("RenderSystem: Post-processing setup failed", error);
      this.useComposer = false;
    }
  }

  // Add methods to control shader parameters
  setCRTParameters(params = {}) {
    if (!this.crtPass) return;

    Object.assign(this.shaderParams.crt, params);
    const uniforms = this.crtPass.uniforms;

    if ('scanlineIntensity' in params) uniforms.scanlineIntensity.value = params.scanlineIntensity;
    if ('vignetteIntensity' in params) uniforms.vignetteIntensity.value = params.vignetteIntensity;
    if ('noise' in params) uniforms.noise.value = params.noise;
    if ('flicker' in params) uniforms.flicker.value = params.flicker;
    if ('curvature' in params) uniforms.curvature.value.copy(params.curvature);
    if ('scanlineCount' in params) uniforms.scanlineCount.value = params.scanlineCount;
    if ('enabled' in params) this.crtPass.enabled = params.enabled;
  }

  setOutlineParameters(params = {}) {
    if (!this.outlinePass) return;

    Object.assign(this.shaderParams.outline, params);
    const uniforms = this.outlinePass.uniforms;

    if ('color' in params) uniforms.outlineColor.value.set(params.color);
    if ('thickness' in params) uniforms.outlineThickness.value = params.thickness;
    if ('depthSensitivity' in params) uniforms.depthSensitivity.value = params.depthSensitivity;
    if ('enabled' in params) this.outlinePass.enabled = params.enabled;
  }

  update(deltaTime) {
    if (!this.initialized || !this.renderer || !this.activeScene) return;

    try {
      // Update CRT effect time
      if (this.crtPass?.enabled) {
        this.crtPass.uniforms.time.value += deltaTime * 0.001;
      }

      // Clear the renderer before rendering
      this.renderer.clear();

      // Perform rendering
      if (this.useComposer && this.composer) {
        // Must manually set renderToScreen on the last pass
        if (this.crtPass?.enabled) {
          this.crtPass.renderToScreen = true;
          if (this.outlinePass) this.outlinePass.renderToScreen = false;
          if (this.renderPass) this.renderPass.renderToScreen = false;
        } else if (this.outlinePass?.enabled) {
          this.outlinePass.renderToScreen = true;
          if (this.crtPass) this.crtPass.renderToScreen = false;
          if (this.renderPass) this.renderPass.renderToScreen = false;
        } else {
          if (this.renderPass) this.renderPass.renderToScreen = true;
          if (this.outlinePass) this.outlinePass.renderToScreen = false;
          if (this.crtPass) this.crtPass.renderToScreen = false;
        }
        
        this.composer.render(deltaTime);
      } else {
        this.renderer.render(this.activeScene, this.activeScene.camera);
      }
    } catch (error) {
      console.error("RenderSystem: Render error", error);
      this.engine.isRunning = false;
    }
  }

  setWireframeMode(enabled) {
    if (enabled === (this.debugRenderMode === DebugRenderMode.WIREFRAME)) return;

    this.debugRenderMode = enabled ? DebugRenderMode.WIREFRAME : DebugRenderMode.NONE;
    this._wireframeMaterial.depthTest = !enabled;
    this._wireframeMaterial.needsUpdate = true;

    if (enabled) {
      this._originalMaterials.clear();
      this.activeScene?.traverse(object => {
        if (object.isMesh && !this._originalMaterials.has(object)) {
          this._originalMaterials.set(object, object.material);
          object.material = this._wireframeMaterial;
        }
      });
    } else {
      this._originalMaterials.forEach((material, object) => {
        if (object.material === this._wireframeMaterial) {
          object.material = material;
        }
      });
      this._originalMaterials.clear();
    }
  }

  toggleComposer(forceState) {
    const newState = forceState === undefined ? !this.useComposer : !!forceState;
    if (newState === this.useComposer) return;

    this.useComposer = newState;
    this.logger.log('DEBUG', 'RenderSystem: Composer toggled', {
      enabled: this.useComposer,
      outlineEnabled: this.outlinePass?.enabled,
      crtEnabled: this.crtPass?.enabled
    });

    // If disabling composer, ensure we reset any active effects
    if (!newState) {
      if (this.outlinePass) this.outlinePass.enabled = false;
      if (this.crtPass) this.crtPass.enabled = false;
    }
  }

  setDebugRenderMode(mode) {
    if (!Object.values(DebugRenderMode).includes(mode)) {
      this.logger.log('ERROR', `RenderSystem: Invalid debug render mode: ${mode}`);
      return;
    }

    this.logger.log('DEBUG', 'RenderSystem: Debug render mode changed', {
      previousMode: this.debugRenderMode,
      newMode: mode
    });

    // Clean up current mode
    if (this.debugRenderMode === DebugRenderMode.WIREFRAME) {
      this.setWireframeMode(false);
    }

    this.debugRenderMode = mode;

    // Set up new mode
    if (mode === DebugRenderMode.WIREFRAME) {
      this.setWireframeMode(true);
    }
  }

  toggleOutlineEffect(forceState) {
    const newState = forceState === undefined ? !this.useOutlineEffect : !!forceState;
    if (newState === this.useOutlineEffect) return;

    this.useOutlineEffect = newState;
    if (this.outlinePass) {
      this.outlinePass.enabled = newState;
    }

    this.logger.log('DEBUG', 'RenderSystem: Outline effect toggled', {
      enabled: this.useOutlineEffect,
      params: this.shaderParams.outline
    });

    // Ensure composer is enabled if using outline effect
    if (newState && !this.useComposer) {
      this.toggleComposer(true);
    }

    // Ensure last pass renders to screen
    if (this.crtEnabled) {
      this.crtPass.renderToScreen = true;
    } else if (this.outlineEnabled) {
      this.outlinePass.renderToScreen = true;
    } else {
      this.renderPass.renderToScreen = true;
    }
  }

  toggleCRTEffect(forceState) {
    const newState = forceState === undefined ? !this.useCRTEffect : !!forceState;
    if (newState === this.useCRTEffect) return;

    this.useCRTEffect = newState;
    if (this.crtPass) {
      this.crtPass.enabled = newState;
    }

    this.logger.log('DEBUG', 'RenderSystem: CRT effect toggled', {
      enabled: this.useCRTEffect,
      params: this.shaderParams.crt
    });

    // Ensure composer is enabled if using CRT effect
    if (newState && !this.useComposer) {
      this.toggleComposer(true);
    }

    // Ensure last pass renders to screen
    if (this.crtEnabled) {
      this.crtPass.renderToScreen = true;
    } else if (this.outlineEnabled) {
      this.outlinePass.renderToScreen = true;
    } else {
      this.renderPass.renderToScreen = true;
    }
  }

  createCanvasTexture(width, height, drawCallback) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      console.error("RenderSystem: Failed to get 2D context");
      return new THREE.Texture();
    }

    canvas.width = width;
    canvas.height = height;

    try {
      drawCallback(context, canvas);
    } catch (error) {
      console.error("RenderSystem: Draw callback error", error);
      context.fillStyle = 'red';
      context.fillRect(0, 0, width, height);
      context.fillStyle = 'white';
      context.font = '16px monospace';
      context.textAlign = 'center';
      context.fillText('Error', width / 2, height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    // Nearest in retro (hard pixel blocks), linear in hires. Redraws
    // re-apply this in RenderComponent.updateTexture on theme toggles.
    texture.minFilter = texture.magFilter = textureFilter();
    return texture;
  }

  createRaycaster(ndcX, ndcY) {
    if (!this.activeScene?.camera) {
      console.error("RenderSystem: Cannot create raycaster without camera");
      return null;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.activeScene.camera);
    return raycaster;
  }

  // Largest canvas with the game's fixed screen aspect that fits the host
  // element (#game-area: the window minus the cabinet panel). The host's
  // flexbox centers the canvas, letterboxing the leftover space.
  _fitScreenSize() {
    const host = this.renderer?.domElement.parentElement
      || document.getElementById('game-area');
    const availW = host?.clientWidth || window.innerWidth;
    const availH = host?.clientHeight || window.innerHeight;
    // Integer 4k x 3k so the canvas ratio is exactly SCREEN_ASPECT — a
    // rounded ratio would feed Scene.resize a camera aspect a hair off 4:3,
    // showing a sliver of surround or cropping the screen edge.
    const k = Math.max(1, Math.floor(Math.min(availW / 4, availH / 3)));
    return { width: 4 * k, height: 3 * k };
  }

  // Cap the backing-store density: phones report ratios of 3+, and the CRT
  // shader over a full-window buffer at that density is wasted GPU work.
  _pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  resize() {
    const { width, height } = this._fitScreenSize();

    if (this.renderer) {
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(this._pixelRatio());
    }

    if (this.activeScene?.resize) {
      this.activeScene.resize(width, height);
    }

    if (this.composer) {
      this.composer.setSize(width, height);
      this.composer.setPixelRatio(window.devicePixelRatio);
    }

    if (this.outlinePass) {
      this.outlinePass.uniforms.resolution.value.set(width, height);
    }

    if (this.crtPass) {
      this.crtPass.uniforms.resolution.value.set(width, height);
    }
  }

  shutdown() {
    this.logger.log('DEBUG', 'RenderSystem: Shutting down');

    // Remove event listeners
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this._contextLostHandler);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this._contextRestoredHandler);
      this.renderer.domElement.remove();
    }

    // Clean up Three.js resources
    this._originalMaterials.clear();
    this.depthTexture?.dispose();

    if (this.composer) {
      this.composer.renderTarget1?.dispose();
      this.composer.renderTarget2?.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    // Clear references
    this.activeScene = null;
    this.renderer = null;
    this.composer = null;
    this.renderPass = null;
    this.outlinePass = null;
    this.crtPass = null;
    this.depthTexture = null;
    this.initialized = false;

    this.logger.log('DEBUG', 'RenderSystem: Shutdown complete');
  }
}

export default RenderSystem;
export { RenderSystem, DebugRenderMode };

