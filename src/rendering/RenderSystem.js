import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CRTShader } from './shaders/CRTShader.js';
import { OutlineShader } from './shaders/OutlineShader.js';
import { SCREEN_ASPECT, validateDisplayProfile } from './displayProfiles.js';
import GameLogger from '../utils/GameLogger.js';

const DebugRenderMode = {
  NONE: 'NONE',
  WIREFRAME: 'WIREFRAME',
  EDGES: 'EDGES',
};

class RenderSystem {
  constructor(engine, { getDisplayProfile = () => null, textureRasterizer = null } = {}) {
    this.engine = engine;
    this.logger = new GameLogger();
    this.getDisplayProfile = getDisplayProfile;
    this.textureRasterizer = textureRasterizer;
    this.activeDisplayProfile = this.getDisplayProfile();
    
    // Three.js core components
    this.renderer = null;
    this.activeScene = null;

    // Post-processing
    this.composer = null;
    this.presentationComposer = null;
    this.presentationPass = null;
    this.renderPass = null;
    this.outlinePass = null;
    this.crtPass = null;
    this.outputPass = null;
    this.depthTexture = null;

    // Rendering flags
    this.initialized = false;
    this.useComposer = true;
    this.isDirectFallback = false;
    this.useOutlineEffect = false;
    this.useCRTEffect = this.activeDisplayProfile?.postProcessing.crt.enabled ?? true;

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
        enabled: this.useCRTEffect,
        scanlineDensity: 0,
        scanlineIntensity: 0.15,
        rgbShiftPixels: 0,
        noise: 0.02,
        flicker: 0.01,
        vignetteIntensity: 0.3,
        brightness: 1,
        saturation: 1,
        curvature: new THREE.Vector2(2.0, 2.0),
        cornerRadius: 0.04
      },
      outline: {
        enabled: false,
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

      const size = this.activeDisplayProfile?.framebuffer;
      if (size && scene.resize) scene.resize(size.width, size.height);

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

  async _handleContextRestored() {
    const profile = this.activeDisplayProfile ?? this.getDisplayProfile();
    await this.setupPostprocessing();
    if (profile && !this.isDirectFallback) this.applyDisplayProfile(profile);
    if (this.engine) this.engine.isRunning = true;
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
      const profile = this.getDisplayProfile();
      validateDisplayProfile(profile);
      this.activeDisplayProfile = profile;
      const displaySize = this._presentationRenderSize();
      const { width, height } = displaySize;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this._setCanvasDisplaySize(displaySize, profile.sampling.output);
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
      if (!this.isDirectFallback) this.applyDisplayProfile(profile);

      this.initialized = true;

      this.logger.log('DEBUG', 'RenderSystem: Successfully initialized', {
        renderer: {
          antialias: false,
          pixelRatio: 1,
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
      this._disposePostprocessing();

      const logicalSize = this._logicalRenderSize();
      const presentationSize = this._presentationRenderSize();
      const pixelRatio = 1;
      const sceneFilter = this._filterFor(this.activeDisplayProfile.sampling.scene);

      // Create render targets with matching format
      const renderTarget1 = new THREE.WebGLRenderTarget(
        logicalSize.width * pixelRatio,
        logicalSize.height * pixelRatio,
        {
          minFilter: sceneFilter,
          magFilter: sceneFilter,
          format: THREE.RGBAFormat,
          //encoding: THREE.sRGBEncoding,
          depthBuffer: true,
          stencilBuffer: false,
          depthTexture: this.depthTexture,
          generateMipmaps: false,
          samples: 0 // Important for compatibility
        }
      );
      
      // Create composer with shared render targets
      this.composer = new EffectComposer(this.renderer, renderTarget1);
      this.composer.setPixelRatio(1);
      this.composer.setSize(logicalSize.width, logicalSize.height);
      this.composer.renderToScreen = false;
      this.useComposer = true;
      this.isDirectFallback = false;
      
      // Add main render pass first
      this.renderPass = new RenderPass(this.activeScene, this.activeScene?.camera);
      this.renderPass.clear = true; // Important!
      this.renderPass.clearDepth = true;
      this.composer.addPass(this.renderPass);

      // Set up outline pass
      this.outlinePass = new ShaderPass(OutlineShader);
      this.outlinePass.uniforms.resolution.value.set(logicalSize.width, logicalSize.height);
      this.outlinePass.uniforms.cameraNear.value = this.activeScene?.camera?.near || 0.1;
      this.outlinePass.uniforms.cameraFar.value = this.activeScene?.camera?.far || 100;
      this.outlinePass.uniforms.tDepth.value = this.composer.readBuffer.depthTexture;
      this.outlinePass.uniforms.outlineColor.value = this.shaderParams.outline.color;
      this.outlinePass.uniforms.outlineThickness.value = this.shaderParams.outline.thickness;
      this.outlinePass.uniforms.depthSensitivity.value = this.shaderParams.outline.depthSensitivity;
      this.outlinePass.enabled = this.shaderParams.outline.enabled;
      this.composer.addPass(this.outlinePass);

      this.presentationComposer = new EffectComposer(this.renderer);
      this.presentationComposer.setPixelRatio(1);
      this.presentationComposer.setSize(presentationSize.width, presentationSize.height);
      this.presentationPass = new TexturePass(this.composer.readBuffer.texture);
      this.presentationComposer.addPass(this.presentationPass);

      // Set up CRT pass last in the presentation composer
      this.crtPass = new ShaderPass(CRTShader);
      this.crtPass.uniforms.sourceResolution.value.set(logicalSize.width, logicalSize.height);
      this.crtPass.uniforms.presentationResolution.value.set(presentationSize.width, presentationSize.height);
      this.crtPass.uniforms.time.value = 0;
      this.crtPass.uniforms.scanlineDensity.value = this.shaderParams.crt.scanlineDensity;
      this.crtPass.uniforms.scanlineIntensity.value = this.shaderParams.crt.scanlineIntensity;
      this.crtPass.uniforms.rgbShiftPixels.value = this.shaderParams.crt.rgbShiftPixels;
      this.crtPass.uniforms.noise.value = this.shaderParams.crt.noise;
      this.crtPass.uniforms.flicker.value = this.shaderParams.crt.flicker;
      this.crtPass.uniforms.vignetteIntensity.value = this.shaderParams.crt.vignetteIntensity;
      this.crtPass.uniforms.brightness.value = this.shaderParams.crt.brightness;
      this.crtPass.uniforms.saturation.value = this.shaderParams.crt.saturation;
      this.crtPass.uniforms.curvature.value.copy(this.shaderParams.crt.curvature);
      this.crtPass.uniforms.cornerRadius.value = this.shaderParams.crt.cornerRadius;
      this.crtPass.enabled = this.shaderParams.crt.enabled;
      this.presentationComposer.addPass(this.crtPass);

      // TexturePass and custom shaders operate on the renderer's linear
      // working color. Convert to the configured display color space only
      // once, at the very end of both the CRT and clean presentation paths.
      this.outputPass = new OutputPass();
      this.presentationComposer.addPass(this.outputPass);

      this.logger.log('DEBUG', 'RenderSystem: Post-processing setup complete', {
        logicalSize: `${logicalSize.width}x${logicalSize.height}`,
        presentationSize: `${presentationSize.width}x${presentationSize.height}`,
        pixelRatio,
        passes: ['render', 'outline', 'crt', 'output']
      });

    } catch (error) {
      this.logger.log('ERROR', 'RenderSystem: Post-processing setup failed', { error: error.message });
      console.error("RenderSystem: Post-processing setup failed", error);
      try {
        this._disposePostprocessing();
      } catch (cleanupError) {
        this.logger.log('ERROR', 'RenderSystem: Partial post-processing cleanup failed', {
          error: cleanupError.message,
        });
        console.error('RenderSystem: Partial post-processing cleanup failed', cleanupError);
      }
      if (this.activeDisplayProfile) this.forceDirectRendering(this.activeDisplayProfile);
      else this.useComposer = false;
    }
  }

  _disposePostprocessing() {
    const resources = [
      ['presentationComposer', this.presentationComposer],
      ['presentationPass', this.presentationPass],
      ['crtPass', this.crtPass],
      ['outputPass', this.outputPass],
      ['composer', this.composer],
      ['renderPass', this.renderPass],
      ['outlinePass', this.outlinePass],
    ];
    let disposalError = null;

    for (const [key, resource] of resources) {
      this[key] = null;
      try {
        resource?.dispose?.();
      } catch (error) {
        disposalError ??= error;
      }
    }

    if (disposalError) throw disposalError;
  }

  _filterFor(sampling) {
    return sampling === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
  }

  _applyCRTPreset(preset, sourceSize, presentationSize) {
    Object.assign(this.shaderParams.crt, {
      enabled: !!preset.enabled,
      scanlineDensity: preset.scanlineDensity,
      scanlineIntensity: preset.scanlineIntensity,
      rgbShiftPixels: preset.rgbShiftPixels,
      noise: preset.noise,
      flicker: preset.flicker,
      vignetteIntensity: preset.vignetteIntensity,
      brightness: preset.brightness,
      saturation: preset.saturation,
      cornerRadius: preset.cornerRadius,
    });
    this.shaderParams.crt.curvature.set(preset.curvature.x, preset.curvature.y);
    this.useCRTEffect = !!preset.enabled;

    if (!this.crtPass) return;
    const uniforms = this.crtPass.uniforms;
    uniforms.sourceResolution?.value.set(sourceSize.width, sourceSize.height);
    uniforms.presentationResolution?.value.set(presentationSize.width, presentationSize.height);
    if (uniforms.scanlineDensity) uniforms.scanlineDensity.value = preset.scanlineDensity;
    if (uniforms.scanlineIntensity) uniforms.scanlineIntensity.value = preset.scanlineIntensity;
    if (uniforms.rgbShiftPixels) uniforms.rgbShiftPixels.value = preset.rgbShiftPixels;
    if (uniforms.noise) uniforms.noise.value = preset.noise;
    if (uniforms.flicker) uniforms.flicker.value = preset.flicker;
    if (uniforms.vignetteIntensity) uniforms.vignetteIntensity.value = preset.vignetteIntensity;
    if (uniforms.brightness) uniforms.brightness.value = preset.brightness;
    if (uniforms.saturation) uniforms.saturation.value = preset.saturation;
    if (uniforms.cornerRadius) uniforms.cornerRadius.value = preset.cornerRadius;
    if (uniforms.curvature?.value.set) {
      uniforms.curvature.value.set(preset.curvature.x, preset.curvature.y);
    }
    this._setCRTPassMembership(!!preset.enabled);
  }

  _setCRTPassMembership(enabled) {
    if (!this.crtPass) return;
    this.crtPass.enabled = enabled;

    const composer = this.presentationComposer;
    const passes = composer?.passes;
    if (!Array.isArray(passes)) return;

    const isAttached = passes.includes(this.crtPass);
    if (enabled && !isAttached) {
      const outputIndex = passes.indexOf(this.outputPass);
      if (outputIndex >= 0) composer.insertPass(this.crtPass, outputIndex);
      else composer.addPass(this.crtPass);
    }
    if (!enabled && isAttached) composer.removePass(this.crtPass);
  }

  applyDisplayProfile(profile) {
    validateDisplayProfile(profile);
    this.activeDisplayProfile = profile;
    this.isDirectFallback = false;
    // The clean high-resolution profile has no presentation effects at all.
    // Render it directly so no CRT/compositor stage can affect the image.
    this.useComposer = !!profile.postProcessing.crt.enabled;
    const logicalSize = this._logicalRenderSize();
    const presentationSize = this._presentationRenderSize();

    this.renderer?.setPixelRatio(1);
    this.renderer?.setSize(presentationSize.width, presentationSize.height, false);
    this._setCanvasDisplaySize(presentationSize, profile.sampling.output);

    this.composer?.setPixelRatio(1);
    this.composer?.setSize(logicalSize.width, logicalSize.height);
    this.presentationComposer?.setPixelRatio(1);
    this.presentationComposer?.setSize(presentationSize.width, presentationSize.height);
    const sceneFilter = this._filterFor(profile.sampling.scene);
    const targets = new Set([
      this.composer?.renderTarget1,
      this.composer?.renderTarget2,
      this.composer?.readBuffer,
      this.composer?.writeBuffer,
    ]);
    for (const target of targets) {
      if (!target?.texture) continue;
      target.texture.minFilter = sceneFilter;
      target.texture.magFilter = sceneFilter;
      target.texture.needsUpdate = true;
    }

    this.outlinePass?.uniforms.resolution.value.set(logicalSize.width, logicalSize.height);
    this._applyCRTPreset(profile.postProcessing.crt, logicalSize, presentationSize);
    this.activeScene?.resize?.(logicalSize.width, logicalSize.height);
  }

  forceDirectRendering(profile) {
    validateDisplayProfile(profile);
    this.useComposer = false;
    this.isDirectFallback = true;
    this.activeDisplayProfile = profile;
    const { width, height } = profile.framebuffer;
    this.renderer?.setPixelRatio(1);
    this.renderer?.setSize(width, height, false);
    this._setCanvasDisplaySize(this._fitScreenSize(), profile.sampling.output);
    this.activeScene?.resize?.(width, height);
  }

  // Add methods to control shader parameters
  setCRTParameters(params = {}) {
    if (!this.crtPass) return;

    const { curvature, ...scalarParams } = params;
    Object.assign(this.shaderParams.crt, scalarParams);
    if (curvature) this.shaderParams.crt.curvature.copy(curvature);
    const uniforms = this.crtPass.uniforms;

    if ('scanlineIntensity' in params) uniforms.scanlineIntensity.value = params.scanlineIntensity;
    if ('vignetteIntensity' in params) uniforms.vignetteIntensity.value = params.vignetteIntensity;
    if ('noise' in params) uniforms.noise.value = params.noise;
    if ('flicker' in params) uniforms.flicker.value = params.flicker;
    if ('brightness' in params) uniforms.brightness.value = params.brightness;
    if ('saturation' in params) uniforms.saturation.value = params.saturation;
    if (curvature) uniforms.curvature.value.copy(this.shaderParams.crt.curvature);
    if ('scanlineDensity' in params) uniforms.scanlineDensity.value = params.scanlineDensity;
    if ('rgbShiftPixels' in params) uniforms.rgbShiftPixels.value = params.rgbShiftPixels;
    if ('cornerRadius' in params) uniforms.cornerRadius.value = params.cornerRadius;
    if ('enabled' in params) this.setCRTEffectEnabled(params.enabled);
  }

  // CRT is a display-mode default: enabled for the two pixel-machine modes
  // and disabled for the clean high-resolution mode. Keep the stored state
  // in sync even before the post-processing pass has been created.
  setCRTEffectEnabled(enabled) {
    const profileAllowsCRT = this.activeDisplayProfile?.postProcessing?.crt?.enabled !== false;
    const next = !!enabled && profileAllowsCRT;
    this.useCRTEffect = next;
    this.shaderParams.crt.enabled = next;
    this._setCRTPassMembership(next);
  }

  setOutlineParameters(params = {}) {
    const { color, ...scalarParams } = params;
    Object.assign(this.shaderParams.outline, scalarParams);
    if (color !== undefined) this.shaderParams.outline.color.set(color);
    if ('enabled' in params) this.useOutlineEffect = !!params.enabled;
    if (!this.outlinePass) return;

    const uniforms = this.outlinePass.uniforms;

    if (color !== undefined) uniforms.outlineColor.value.copy(this.shaderParams.outline.color);
    if ('thickness' in params) uniforms.outlineThickness.value = params.thickness;
    if ('depthSensitivity' in params) uniforms.depthSensitivity.value = params.depthSensitivity;
    if ('enabled' in params) this.outlinePass.enabled = !!params.enabled;
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
      if (this.useComposer && this.composer && this.presentationComposer && this.presentationPass) {
        // EffectComposer swaps its read/write targets after the outline pass.
        // Sample the depth texture attached to the target the RenderPass will
        // fill this frame; keeping a fixed depth texture creates a WebGL
        // framebuffer feedback loop on alternating frames.
        if (this.outlinePass?.uniforms?.tDepth) {
          this.outlinePass.uniforms.tDepth.value = this.composer.readBuffer.depthTexture;
        }
        this.composer.render(deltaTime);
        this.presentationPass.map = this.composer.readBuffer.texture;
        this.presentationComposer.render(deltaTime);
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
    if (newState && this.isDirectFallback) return;
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
    if (newState && this.isDirectFallback) return;
    if (newState === this.useOutlineEffect) return;

    this.useOutlineEffect = newState;
    this.shaderParams.outline.enabled = newState;
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

  }

  toggleCRTEffect(forceState) {
    const newState = forceState === undefined ? !this.useCRTEffect : !!forceState;
    if (newState && this.isDirectFallback) return;
    if (newState === this.useCRTEffect) return;

    this.setCRTEffectEnabled(newState);

    this.logger.log('DEBUG', 'RenderSystem: CRT effect toggled', {
      enabled: this.useCRTEffect,
      params: this.shaderParams.crt
    });

    // Ensure composer is enabled if using CRT effect
    if (this.useCRTEffect && !this.useComposer) {
      this.toggleComposer(true);
    }

  }

  createCanvasTexture(width, height, drawCallback, options = {}) {
    const { worldWidth, label } = options;
    if (this.textureRasterizer
      && (!Number.isFinite(worldWidth) || worldWidth <= 0
        || typeof label !== 'string' || label.length === 0)) {
      throw new TypeError('Registered canvas textures require worldWidth and label metadata');
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      console.error("RenderSystem: Failed to get 2D context");
      return new THREE.Texture();
    }

    canvas.width = width;
    canvas.height = height;

    const texture = new THREE.CanvasTexture(canvas);
    // Canvas 2D colors are authored in sRGB. Without this annotation Three.js
    // treats them as linear and applies the output transfer a second time,
    // visibly lifting #2050c8 to roughly #6398e5.
    texture.colorSpace = THREE.SRGBColorSpace;
    if (this.textureRasterizer) {
      this.textureRasterizer.register({
        label,
        canvas,
        texture,
        nativeWidth: width,
        nativeHeight: height,
        worldWidth,
        draw: drawCallback,
      });
      return texture;
    }

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

    const sampling = this.activeDisplayProfile?.sampling.textures ?? 'linear';
    texture.minFilter = texture.magFilter = this._filterFor(sampling);
    texture.needsUpdate = true;
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

  _renderSize() {
    const profile = this.activeDisplayProfile ?? this.getDisplayProfile();
    validateDisplayProfile(profile);
    return { ...profile.framebuffer };
  }

  _logicalRenderSize() {
    return this._renderSize();
  }

  _presentationRenderSize() {
    return this._fitScreenSize();
  }

  _setCanvasDisplaySize({ width, height }, outputSampling = this.activeDisplayProfile?.sampling.output ?? 'auto') {
    if (!this.renderer?.domElement) return;
    const canvas = this.renderer.domElement;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.imageRendering = outputSampling;
  }

  resize() {
    if (!this.renderer || !this.activeDisplayProfile) return;
    const size = this._presentationRenderSize();
    if (this.isDirectFallback) {
      this._setCanvasDisplaySize(size, this.activeDisplayProfile.sampling.output);
      return;
    }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size.width, size.height, false);
    this._setCanvasDisplaySize(size, this.activeDisplayProfile.sampling.output);
    this.presentationComposer?.setPixelRatio(1);
    this.presentationComposer?.setSize(size.width, size.height);
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
    try {
      this._disposePostprocessing();
    } catch (error) {
      this.logger.log('ERROR', 'RenderSystem: Post-processing cleanup failed', { error: error.message });
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    // Clear references
    this.activeScene = null;
    this.renderer = null;
    this.depthTexture = null;
    this.initialized = false;

    this.logger.log('DEBUG', 'RenderSystem: Shutdown complete');
  }
}

export default RenderSystem;
export { RenderSystem, DebugRenderMode };

