import * as THREE from 'three';
import { Scene } from '../engine/Scene.js';
import { GameObject } from '../engine/GameObject.js';
import { GameManagerComponent } from './Game.js';
import { BackgroundRenderComponent } from '../rendering/BackgroundRenderComponent.js';
import { createPayTable } from '../rendering/PayTable.js';
import { createStatusBar } from '../rendering/UIFactory.js';
import { createDebugPanel } from '../utils/DebugPanel.js';
import { createParticleEmitter } from '../rendering/ParticleSystem.js';
import { createWinDisplay } from '../rendering/WinDisplayComponent.js';
import { createScreenShake } from '../rendering/ScreenShakeComponent.js';
import HandEvaluator from './HandEvaluator.js';
import { CabinetPanel } from '../ui/CabinetPanel.js';
import { createTicker } from '../rendering/TickerComponent.js';
import { createGambleHints } from '../rendering/GambleHints.js';
import { AudioDirector } from '../audio/AudioDirector.js';
import { toggleTheme, SCREEN_ASPECT } from '../rendering/theme.js';

class GameScene extends Scene {
  constructor() {
    super('GameScene');
    this.gameManager = null;
    this.audioSystem = null;
  }

  async initialize() {
    // Get references to systems
    this.audioSystem = this.engine.systems.get('audio');
    const renderSystem = this.engine.systems.get('render');

    // Create and set up orthographic camera. The visible world is the fixed
    // 4:3 game screen — the canvas is letterboxed to the same ratio, so the
    // camera never widens with the window.
    this.camera = new THREE.OrthographicCamera(
      -SCREEN_ASPECT, SCREEN_ASPECT,  // left, right
      1, -1,           // top, bottom
      0.1, 100        // near, far
    );
    this.camera.position.z = 10;
    this.camera.updateProjectionMatrix();
    this.add(this.camera);

    // Set up post-processing shaders
    if (renderSystem) {
      renderSystem.setOutlineParameters({
        color: 0x00ff00,
        thickness: 1.5,
        depthSensitivity: 0.05
      });

      renderSystem.setCRTParameters({
        scanlineIntensity: 0.1,
        vignetteIntensity: 0.1,
        noise: 0.02,
        flicker: 0.01,
        curvature: new THREE.Vector2(4, 4)
      });
    }

    // Create background
    const bgObject = new GameObject('Background');
    bgObject.position.z = -1;
    this.add(bgObject);
    bgObject.addComponent(new BackgroundRenderComponent());

    // Create game manager
    const gameManagerObject = new GameObject('GameManager');
    this.add(gameManagerObject);
    this.gameManager = gameManagerObject.addComponent(new GameManagerComponent());

    // In screen-only UI mode the field halves are the tuplaus guess
    // buttons: taps that hit nothing more specific land on the background
    // (chooseDouble ignores them outside the gamble state).
    bgObject.getComponent('Render').onFieldGuess =
      (side) => this.gameManager.chooseDouble(side);

    // Create pay table
    const payTableObject = createPayTable(0.55, 0.30);
    payTableObject.position.z = 0;
    this._addRendered(payTableObject);

    // Create win display first so it can be referenced by other components;
    // centered on the hand row (Game._handSlot y).
    const winDisplay = createWinDisplay(0, -0.46);
    winDisplay.position.z = 0;
    this._addRendered(winDisplay);

    // Create status bar (Credits / Bet / Wins) — one parent object whose
    // children are positioned relative to it.
    this._addRendered(createStatusBar(this.gameManager));

    // Rules ticker on the bottom band, shown only during tuplaus.
    this._addRendered(createTicker(this.gameManager));

    // LOW/HIGH tap hints beside the double card (screen-only UI mode).
    this._addRendered(createGambleHints(this.gameManager));

    // Create debug panel
    const debugPanel = createDebugPanel();
    this._addRendered(debugPanel);

    // Create particle emitter
    const particleEmitter = createParticleEmitter();
    this._addRendered(particleEmitter);

    // Create screen shake
    const screenShake = createScreenShake();
    this._addRendered(screenShake);

    // Set up event handlers
    this.setupEventHandlers(
      this.gameManager,
      payTableObject,
      winDisplay,
      particleEmitter,
      screenShake
    );

    // Create the cabinet button panel (DOM element below the canvas). It
    // takes over the bottom of the window, so re-fit the canvas to what's
    // left (index.js routes the resize event to RenderSystem.resize).
    this.cabinetPanel = new CabinetPanel(this.gameManager);
    window.dispatchEvent(new Event('resize'));

    // Wire up event-driven machine-faithful audio
    this.audioDirector = new AudioDirector(this.audioSystem, this.gameManager);

    // Start the game in its initial state
    this.gameManager.setInitialState();

    // F2 flips between the retro (pixelated) and hires display modes.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        toggleTheme();
      }
    });
  }

  // Add a GameObject to the scene and run its components' lifecycle now that the
  // engine reference is set. Factory-built objects add their components before the
  // object has an engine, so RenderComponent.onAdd (which creates the meshes) never
  // fires via Scene.add alone. This triggers it once, guarded against double-init.
  // Recurses into nested GameObjects so parent/child hierarchies (child positions
  // relative to their parents, per three.js Object3D semantics) initialize the
  // same way flat scene objects do.
  _addRendered(obj) {
    this.add(obj);
    const initTree = (node) => {
      if (node.components) {
        node.engine = this.engine; // must be set before onAdd runs
        for (const c of node.components.values()) {
          if (c._lifecycleInit) continue;
          c._lifecycleInit = true;
          if (c.onAdd) c.onAdd();
          if (c.onStart) c.onStart();
        }
      }
      for (const child of node.children ?? []) {
        if (child.components) initTree(child);
      }
    };
    initTree(obj);
    return obj;
  }

  setupEventHandlers(gameManager, payTable, winDisplay, particleEmitter, screenShake) {
    // Handle win events with coordinated animations and effects
    gameManager.addEventListener('win', ({ result, winnings }) => {
      const payTableComponent = payTable.getComponent('PayTable');
      const displayComponent = winDisplay.getComponent('WinDisplay');
      const emitterComponent = particleEmitter.getComponent('ParticleEmitter');
      const shakeComponent = screenShake.getComponent('ScreenShake');

      // Get detailed evaluation results
      const hand = gameManager.hand.map(card => card.getComponent('Card'));
      const details = HandEvaluator.evaluateWithDetails(hand, gameManager.bet);

      // Coordinate win animations
      if (displayComponent) {
        displayComponent.showWin(winnings, () => {
          // Trigger effects after win amount is shown
          if (emitterComponent) {
            emitterComponent.burstAt(
              { x: 0, y: 0.2 },
              this.getWinEffectOptions(details)
            );
          }

          // Trigger appropriate screen shake
          if (shakeComponent) {
            const intensity = this.getShakeIntensity(winnings);
            const duration = 0.3 + (result.payout / 800) * 0.7;
            shakeComponent.shake(intensity, duration);
          }

          // Notify audio system
          if (this.audioSystem) {
            this.audioSystem.emit('win', { result: details });
          }
        });
      }

      // Update pay table highlight
      if (payTableComponent) {
        payTableComponent.highlightWin(result.key);
      }
    });

    // Handle state changes
    gameManager.addEventListener('stateChanged', ({ state }) => {
      // Clear the win highlight and "WIN" overlay when a hand is no longer being
      // shown as a result: on a new deal, and once the win has been collected/lost
      // (idle) or the machine returns to attract mode.
      if (state === 'dealing' || state === 'idle' || state === 'attract') {
        const payTableComponent = payTable.getComponent('PayTable');
        if (payTableComponent) {
          payTableComponent.highlightWin('');
        }

        const displayComponent = winDisplay.getComponent('WinDisplay');
        if (displayComponent) {
          displayComponent.reset();
        }
      }
    });

    // The tuplaus card is dealt to the hand-row center, where the "WIN:"
    // overlay sits — clear the overlay when double mode starts (the Wins
    // status box keeps showing the amount).
    gameManager.addEventListener('doubleStarted', () => {
      winDisplay.getComponent('WinDisplay')?.reset();
    });

    // Handle card interactions
    gameManager.addEventListener('cardHeld', (data) => {
      if (this.audioSystem) {
        this.audioSystem.emit('cardHeld', data);
      }
    });
  }

  getWinEffectOptions(details) {
    const baseOptions = {
      count: this.getParticleCount(details.totalWin),
      duration: 1.5,
      color: this.getWinColor(details.name),
      minLife: 0.8,
      maxLife: 2
    };

    if (details.details.hasJoker) {
      baseOptions.count *= 1.5;
      baseOptions.minLife *= 1.2;
      baseOptions.maxLife *= 1.2;
    }

    return baseOptions;
  }

  getParticleCount(winnings) {
    return Math.min(100, Math.max(20, Math.floor(winnings / 10)));
  }

  getShakeIntensity(winnings) {
    return Math.min(0.1, Math.max(0.02, winnings / 1000));
  }

  getWinColor(handName) {
    switch (handName.toLowerCase()) {
      case 'royal flush':
        return 0xffd700; // Gold
      case 'straight flush':
        return 0xff4500; // Red-Orange
      case 'four of a kind':
        return 0xff1493; // Deep Pink
      case 'full house':
        return 0x9370db; // Medium Purple
      case 'flush':
        return 0x00ff7f; // Spring Green
      case 'straight':
        return 0x00bfff; // Deep Sky Blue
      case 'three of a kind':
        return 0xff6347; // Tomato
      case 'two pair':
        return 0x32cd32; // Lime Green
      case 'jacks or better':
        return 0x4169e1; // Royal Blue
      default:
        return 0xffff00; // Yellow
    }
  }

  // Add visible markers at screen corners to help debug what's in view
  addDebugBounds() {
    const aspect = window.innerWidth / window.innerHeight;
    
    // Create markers at the four corners of camera view
    const corners = [
      { x: -aspect + 0.1, y: 0.9, color: 0xff0000 },  // Top-left (red)
      { x: aspect - 0.1, y: 0.9, color: 0x00ff00 },   // Top-right (green)
      { x: -aspect + 0.1, y: -0.9, color: 0x0000ff }, // Bottom-left (blue)
      { x: aspect - 0.1, y: -0.9, color: 0xffff00 }   // Bottom-right (yellow)
    ];
    
    corners.forEach(corner => {
      const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const material = new THREE.MeshBasicMaterial({ color: corner.color });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(corner.x, corner.y, 0);
      this.add(marker);
    });
  }
}

export default GameScene;
