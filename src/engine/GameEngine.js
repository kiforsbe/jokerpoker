import GameLogger from '../utils/GameLogger.js';

class GameEngine {
  constructor() {
    this.systems = new Map();
    this.currentScene = null;
    this.isRunning = false;
    this.lastFrameTime = 0;
    this.fixedTimeStep = 1000 / 60; // 60 fps fixed update
    this.accumulator = 0;
    this.logger = new GameLogger();

    this.logger.log('DEBUG', 'GameEngine: Created with initial settings', {
      fixedTimeStep: this.fixedTimeStep,
      targetFPS: 60
    });
  }

  addSystem(name, system) {
    this.systems.set(name, system);
    this.logger.log('DEBUG', 'GameEngine: System added', {
      systemName: name,
      systemType: system.constructor.name
    });
    if (system.init) {
      system.init(this);
    }
  }

  addGameObject(gameObject) {
    if (!this.currentScene) {
      this.logger.log('ERROR', 'GameEngine: Cannot add GameObject - No active scene');
      return;
    }

    // Set engine reference (needed for accessing systems)
    gameObject.engine = this;
    
    // Recursively set engine reference for all children
    // This ensures all child objects get a proper engine reference too
    gameObject.traverse((child) => {
      if (child !== gameObject && child.isObject3D && 'engine' in child) {
        child.engine = this;
      }
    });

    // Add to scene (THREE.Scene) - this handles the object hierarchy
    this.currentScene.add(gameObject);

    // Important fix: For UI components added after render system is initialized,
    // manually ensure their onRenderSystemReady gets called
    const renderSystem = this.systems.get('render');
    if (renderSystem && renderSystem.initialized) {
      // Process any RenderComponents that need initialization
      gameObject.traverse((child) => {
        if (child.components) {
          for (const component of child.components.values()) {
            if (component.onRenderSystemReady && 
                (component.type === 'UI' || component.type === 'Render')) {
              this.logger.log('DEBUG', 'GameEngine: Late-initializing render component', {
                gameObject: child.name,
                componentType: component.type
              });
              component.onRenderSystemReady();
            }
          }
        }
      });
    }

    // Call onStart for the object and all its components
    if (gameObject.onStart) gameObject.onStart();
    gameObject.traverse((child) => {
      if (child.components) {
        for (const component of child.components.values()) {
          if (component.onStart) {
            component.onStart();
          }
        }
      }
    });

    this.logger.log('DEBUG', 'GameEngine: GameObject added', {
      name: gameObject.name,
      components: Array.from(gameObject.components?.keys() || [])
    });
  }

  removeGameObject(gameObject) {
    if (!this.currentScene) {
      this.logger.log('ERROR', 'GameEngine: Cannot remove GameObject - No active scene');
      return;
    }

    // Remove from scene
    this.currentScene.remove(gameObject);

    // Fully destroy the GameObject: runs onRemove (and onDestroy) for every
    // component - including unsubscribing listeners such as the theme-change
    // listener in CardRenderComponent - and disposes meshes/materials/
    // textures. destroy() is idempotent (guarded by _destroyed), so this is
    // safe even if the caller already detached/removed the object elsewhere.
    if (gameObject.destroy) {
      gameObject.destroy();
    }

    this.logger.log('DEBUG', 'GameEngine: GameObject removed', {
      name: gameObject.name
    });

    // Clear engine reference
    gameObject.engine = null;
  }

  async setScene(scene) {
    // Unload the old scene if valid
    if (this.currentScene && this.currentScene.onUnload) {
      try {
        this.logger.log('DEBUG', 'GameEngine: Unloading old scene', {
          previousScene: this.currentScene.constructor.name
        });

        this.currentScene.onUnload();
        this.currentScene = null;

        this.logger.log('DEBUG', 'GameEngine: Old scene unloaded');
      }
      catch (error) {
        this.logger.log('ERROR', 'GameEngine: Failed to unload old scene', {
          error: error.message
        });
      }
    }

    // Load the new scene if valid
    if (scene) {
      try {
        this.logger.log('DEBUG', 'GameEngine: Loading new scene', {
          newScene: scene.constructor.name
        });

        // First set the scene as current and establish engine reference
        this.currentScene = scene;
        
        // Initialize the scene
        await scene.onLoad(this);

        // Then finally notify render system if available
        const renderSystem = this.systems.get('render');
        if (renderSystem) {
          renderSystem.setActiveScene(scene);
        }

        this.logger.log('DEBUG', 'GameEngine: Loaded new scene', {
          newScene: scene.constructor.name
        });
      }
      catch (error) {
        this.logger.log('ERROR', 'GameEngine: Failed to load new scene', {
          error: error.message
        });
        throw error;
      }
    }
  }

  async init() {
    this.logger.log('DEBUG', 'GameEngine: Starting initialization');

    // Initialize core systems
    const renderSystem = this.systems.get('render');
    const inputSystem = this.systems.get('input');
    const audioSystem = this.systems.get('audio');

    if (!renderSystem) throw new Error('RenderSystem is required');
    if (!inputSystem) throw new Error('InputSystem is required');
    if (!audioSystem) throw new Error('AudioSystem is required');

    try {
      // Initialize render system first to set up WebGL context
      await renderSystem.init();
      
      // Start game loop
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.logger.log('DEBUG', 'GameEngine: Successfully initialized');
      requestAnimationFrame(() => this.gameLoop());

    } catch (error) {
      this.logger.log('ERROR', 'GameEngine: Initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  gameLoop() {
    if (!this.isRunning) {
      this.logger.log('DEBUG', 'GameEngine: Game loop stopped');
      return;
    }

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
    this.lastFrameTime = currentTime;

    // Fixed timestep updates
    this.accumulator += deltaTime * 1000; // Convert to ms

    // Fixed timestep updates
    while (this.accumulator >= this.fixedTimeStep) {
      this.fixedUpdate(this.fixedTimeStep / 1000); // Convert back to seconds for consistency
      this.accumulator -= this.fixedTimeStep;
    }

    // Variable timestep update
    this.update(deltaTime);

    // Request next frame
    requestAnimationFrame(() => this.gameLoop());
  }

  fixedUpdate(fixedDeltaTime) {
    if (!this.currentScene) return;

    // Update scene objects with fixed timestep
    this.currentScene.traverse((object) => {
      if (object.fixedUpdate) object.fixedUpdate(fixedDeltaTime);
      if (object.components) {
        for (const component of object.components.values()) {
          if (component.enabled && component.fixedUpdate) {
            component.fixedUpdate(fixedDeltaTime);
          }
        }
      }
    });
  }

  update(deltaTime) {
    if (!this.currentScene) return;

    // Update systems
    for (const system of this.systems.values()) {
      if (system.update) system.update(deltaTime);
    }

    // Update scene objects
    this.currentScene.traverse((object) => {
      if (object.update) object.update(deltaTime);
      if (object.components) {
        for (const component of object.components.values()) {
          if (component.enabled && component.update) {
            component.update(deltaTime);
          }
        }
      }
    });
  }

  shutdown() {
    this.logger.log('DEBUG', 'GameEngine: Initiating shutdown');

    this.isRunning = false;

    // Shutdown all systems
    for (const [name, system] of this.systems) {
      if (system.shutdown) {
        system.shutdown();
      }
      this.logger.log('DEBUG', 'GameEngine: System shutdown', { systemName: name });
    }

    // Clear all collections
    this.systems.clear();
    this.currentScene = null;

    this.logger.log('DEBUG', 'GameEngine: Shutdown complete');
  }

  findGameObjectByName(name) {
    let result = null;
    this.currentScene?.traverse((object) => {
      if (object.name === name) {
        result = object;
      }
    });
    return result;
  }

  findGameObjectWithComponent(componentType) {
    let result = null;
    this.currentScene?.traverse((object) => {
      if (object.getComponent?.(componentType)) {
        result = object;
      }
    });
    return result;
  }
}

export default GameEngine;
