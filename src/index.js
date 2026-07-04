import * as THREE from 'three';
import GameEngine from './engine/GameEngine.js';
import RenderSystem from './rendering/RenderSystem.js';
import AudioSystem from './audio/AudioSystem.js';
import InputSystem from './engine/InputSystem.js';
import GameScene from './game/GameScene.js';
import GameLogger from './utils/GameLogger.js';

class JokerPokerGame {
  constructor() {
    // Verify Three.js is loaded
    if (!THREE) {
      throw new Error('Three.js is not loaded');
    }

    this.logger = new GameLogger();
    this.logger.log('DEBUG', 'JokerPokerGame: Starting initialization');

    // Initialize game state
    this.engine = null;
    this.audioSystem = null;
    this.inputSystem = null;
    this.renderSystem = null;
    this.gameScene = null;

    // Initialize game engine and systems
    this.init()
      .then(() => {
        // Load initial scene
        this.loadGame();
      })
      .catch(error => {
        this.logger.log('ERROR', 'JokerPokerGame: Initialization failed', {
          error: error.message
        });
        this.showError(error.message);
      });
  }

  async init() {
    // Initialize game engine
    this.engine = new GameEngine();
    this.logger.log('DEBUG', 'JokerPokerGame: Engine created');

    // Initialize render system
    this.renderSystem = new RenderSystem(this.engine);
    this.engine.addSystem('render', this.renderSystem);

    // Create and add audio system
    this.audioSystem = new AudioSystem(this.engine);
    this.engine.addSystem('audio', this.audioSystem);

    // Create and add input system
    this.inputSystem = new InputSystem(this.engine);
    this.engine.addSystem('input', this.inputSystem);

    // Initialize the engine (this will initialize render system and start game loop)
    await this.engine.init();

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.renderSystem.renderer) {
        this.renderSystem.resize();
      }
    });

    // Add click-to-start overlay if audio isn't initialized
    if (!this.audioSystem.initialized) {
      const startOverlay = document.createElement('div');
      startOverlay.style.position = 'fixed';
      startOverlay.style.top = '50%';
      startOverlay.style.left = '50%';
      startOverlay.style.transform = 'translate(-50%, -50%)';
      startOverlay.style.color = '#fff';
      startOverlay.style.fontFamily = 'monospace';
      startOverlay.style.fontSize = '24px';
      startOverlay.style.cursor = 'pointer';
      startOverlay.style.userSelect = 'none';
      startOverlay.style.textAlign = 'center';
      startOverlay.innerHTML = 'Click to Start';
      document.body.appendChild(startOverlay);

      // Wait for audio initialization
      await this.audioSystem.init();
      startOverlay.remove();
    }

    this.logger.log('DEBUG', 'JokerPokerGame: Systems initialized');
  }

  async loadGame() {
    try {
      // Ensure the retro canvas font has real glyphs before textures draw.
      // If the CDN is unreachable the load rejects and we proceed with the
      // monospace fallback — the game must still boot offline.
      try {
        await document.fonts.load('32px "VT323"');
      } catch { /* fallback font is acceptable */ }

      // Create initial game scene
      this.gameScene = new GameScene();
      
      // Wait for scene to fully load and initialize
      await this.engine.setScene(this.gameScene);

      // Enable input system after scene is fully loaded
      this.inputSystem.enable();

      this.logger.log('DEBUG', 'JokerPokerGame: Game scene loaded');

      // Hide loading screen
      const loadingElement = document.getElementById('loading');
      if (loadingElement) {
        loadingElement.style.display = 'none';
      }

    } catch (error) {
      this.logger.log('ERROR', 'JokerPokerGame: Failed to load game scene', {
        error: error.message
      });
      this.showError('Failed to initialize game: ' + error.message);
    }
  }

  showError(message) {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
      loadingElement.style.display = 'none';
    }

    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '50%';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translate(-50%, -50%)';
    errorDiv.style.color = '#ff0000';
    errorDiv.style.fontFamily = 'monospace';
    errorDiv.style.fontSize = '24px';
    errorDiv.style.textAlign = 'center';
    errorDiv.innerHTML = `ERROR:<br>${message}`;
    document.body.appendChild(errorDiv);

    this.logger.log('ERROR', 'JokerPokerGame: Fatal error', {
      message: message
    });
  }
}

// Start the game when modules are loaded
try {
  window.game = new JokerPokerGame();
} catch (error) {
  const logger = new GameLogger();
  logger.log('ERROR', 'Failed to start game', {
    error: error.message
  });
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.innerHTML = 'Error: ' + error.message;
  } else {
    // Fallback if loading element isn't found
    alert('Error starting game: ' + error.message);
  }
}

export { JokerPokerGame };
