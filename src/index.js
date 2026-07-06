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

    // Wait for the first tap/click/key on the intro screen — the same
    // gesture unlocks web audio (AudioSystem.init listens on window).
    if (!this.audioSystem.initialized) {
      const intro = document.getElementById('intro');
      const status = document.getElementById('intro-status');
      if (intro && status) {
        intro.classList.add('ready');
        status.textContent = 'TAP TO START';
      }

      // The game must never be stuck behind audio: if the unlock doesn't
      // finish shortly after the first gesture (iOS Safari can reject or
      // stall it), boot anyway — the audio system keeps retrying on later
      // gestures by itself.
      const firstGestureThenGrace = new Promise((res) => {
        const arm = () => setTimeout(res, 1500);
        for (const e of ['pointerup', 'touchend', 'keydown']) {
          window.addEventListener(e, arm, { once: true });
        }
      });
      await Promise.race([this.audioSystem.init(), firstGestureThenGrace]);

      if (intro && status) {
        intro.classList.remove('ready');
        status.textContent = 'LOADING...';
      }
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

      // Fade the intro screen out over the running game
      const intro = document.getElementById('intro');
      if (intro) {
        intro.classList.add('hidden');
        intro.addEventListener('transitionend', () => intro.remove(), { once: true });
      }

    } catch (error) {
      this.logger.log('ERROR', 'JokerPokerGame: Failed to load game scene', {
        error: error.message
      });
      this.showError('Failed to initialize game: ' + error.message);
    }
  }

  showError(message) {
    // Surface the error on the intro screen (recreated if already removed).
    let intro = document.getElementById('intro');
    if (!intro) {
      intro = document.createElement('div');
      intro.id = 'intro';
      intro.innerHTML = '<div class="title">JOKER POKER</div><div class="status" id="intro-status"></div>';
      document.body.appendChild(intro);
    }
    intro.classList.remove('hidden', 'ready');
    intro.classList.add('error');
    const status = document.getElementById('intro-status');
    if (status) status.textContent = 'ERROR: ' + message;

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
  const intro = document.getElementById('intro');
  const status = document.getElementById('intro-status');
  if (intro && status) {
    intro.classList.add('error');
    status.textContent = 'ERROR: ' + error.message;
  } else {
    // Fallback if the intro screen isn't found
    alert('Error starting game: ' + error.message);
  }
}

export { JokerPokerGame };
