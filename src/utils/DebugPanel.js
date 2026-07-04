import * as THREE from 'three';
import Component from '../engine/Component.js';
import GameObject from '../engine/GameObject.js';
import { DebugRenderMode } from '../rendering/RenderSystem.js';
import { ButtonComponent, TextDisplayComponent } from '../rendering/UIComponent.js';
import { getTheme } from '../rendering/theme.js';

class DebugPanelComponent extends Component {
  constructor() {
    super();
    this.visible = false;
    this.panel = null;
    this.stats = {
      fps: 0,
      frameTime: 0,
      gameObjects: 0,
      renderables: 0,
      audioComponents: 0,
      memory: {
        used: 0,
        total: 0
      }
    };
    this.lastFrameTime = performance.now();
    this.fpsHistory = new Array(60).fill(0); // Store last 30 frame FPS values
    this.frameCount = 0; // Used for averaging FPS
    // --- Scene Tree --- 
    this.sceneTreeElement = null;
    this.updateInterval = 16; // Update roughly every frame at 60fps
    this.lastUpdateTime = 0;
    this._frustum = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this._vec3 = new THREE.Vector3();
    this._euler = new THREE.Euler();
    this.componentStatusHelpers = new Map([
      ['Card', this.getCardStatus],
      ['Render', this.getRenderStatus],
      ['Audio', this.getAudioStatus],
      ['CardFlip', this.getCardFlipStatus],
      ['CardMovement', this.getMovementStatus],
      ['UI', this.getUIStatus],
      ['WinDisplay', this.getWinDisplayStatus],
      ['PayTable', this.getPayTableStatus],
      ['ParticleEmitter', this.getParticleStatus],
      ['ScreenShake', this.getScreenShakeStatus],
      ['Camera', this.getCameraStatus]
    ]);
  }

  get type() {
    return 'DebugPanel';
  }

  onStart() {
    super.onStart();

    // Create debug panel UI
    this.createPanel();

    // Listen for toggle key
    this._keydownListener = (e) => {
      const renderSystem = this.engine?.systems.get('render');
      if (!renderSystem) return;

      // Debug shortcuts require Alt so they never collide with gameplay keys
      // (d = double, c = collect, etc. on the cabinet panel).
      if (!e.altKey) return;

      switch (e.key) {
        case 'd': // Toggle Debug Panel
          this.togglePanel();
          break;

        case 'c': // Toggle CRT Effect
          if (renderSystem.toggleCRTEffect) {
            renderSystem.toggleCRTEffect();
            console.log(`DebugPanel: Toggled CRT effect. Now: ${renderSystem.useCRTEffect ? 'ON' : 'OFF'}`);
            if (this.visible) this.update(0);
          }
          break;

        case 'o': // Toggle Outline Effect
          if (renderSystem.toggleOutlineEffect) {
            renderSystem.toggleOutlineEffect();
            console.log(`DebugPanel: Toggled Outline effect. Now: ${renderSystem.useOutlineEffect ? 'ON' : 'OFF'}`);
            if (this.visible) this.update(0);
          }
          break;

        case 'r': // Toggle Render Mode
          if (renderSystem.toggleComposer) {
            renderSystem.toggleComposer();
            console.log(`DebugPanel: Toggled composer. Now: ${renderSystem.useComposer ? 'ON' : 'OFF'}`);
            if (this.visible) this.update(0);
          }
          break;

        case 'w': // Cycle Debug Render Mode
          const modes = Object.values(DebugRenderMode);
          const currentIndex = modes.indexOf(renderSystem.debugRenderMode);
          const nextIndex = (currentIndex + 1) % modes.length;
          const nextMode = modes[nextIndex];

          // Disable current mode if active
          if (renderSystem.debugRenderMode === DebugRenderMode.WIREFRAME) {
            renderSystem.setWireframeMode(false);
          }

          // Enable new mode
          if (nextMode === DebugRenderMode.WIREFRAME) {
            renderSystem.setWireframeMode(true);
          }
          renderSystem.debugRenderMode = nextMode;

          console.log(`DebugPanel: Set debug render mode to: ${nextMode}`);
          if (this.visible) this.update(0);
          break;
      }
    };
    window.addEventListener('keydown', this._keydownListener);
  }

  createPanel() {
    // Guard against double creation (onAdd and onStart both call this).
    if (this.panel) return;
    this.panel = document.createElement('div');
    this.panel.id = 'debug-panel';
    this.panel.style.position = 'fixed';
    this.panel.style.top = '10px';
    this.panel.style.left = '10px';
    this.panel.style.padding = '10px';
    this.panel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    this.panel.style.color = '#0f0';
    this.panel.style.fontFamily = 'monospace';
    this.panel.style.fontSize = '12px';
    this.panel.style.border = '1px solid #0f0';
    this.panel.style.zIndex = '10000';
    this.panel.style.maxHeight = '90vh'; // Prevent panel from becoming too tall
    this.panel.style.overflowY = 'auto'; // Allow scrolling
    this.panel.style.display = this.visible ? 'block' : 'none';
    this.panel.style.minWidth = '300px'; // Increased width slightly for coords

    // --- Create Scene Tree Container ---
    this.sceneTreeElement = document.createElement('div');
    this.sceneTreeElement.id = 'debug-scene-tree';
    this.sceneTreeElement.style.marginTop = '10px';
    this.sceneTreeElement.style.borderTop = '1px dashed #0f0';
    this.sceneTreeElement.style.paddingTop = '5px';
    // ---

    this.panel.innerHTML = `<div>Loading stats...</div>`; // Initial content
    this.panel.appendChild(this.sceneTreeElement); // Add scene tree container

    document.body.appendChild(this.panel);
  }

  togglePanel() {
    this.visible = !this.visible;
    if (this.panel) {
      this.panel.style.display = this.visible ? 'block' : 'none';
      // Update stats immediately when shown
      if (this.visible) this.update(0);
    }
  }

  update(deltaTime) {
    const now = performance.now();

    // Always update stats even if panel is hidden
    this.updateStats(deltaTime);

    // Update visual display only if visible and enough time has passed
    if (this.visible && (now - this.lastUpdateTime) >= this.updateInterval) {
      this.lastUpdateTime = now;
      this.updateDisplay();
    }
  }

  updateStats(deltaTime) {
    if (!this.engine) return;

    const now = performance.now();
    this.lastFrameTime = now;

    // --- Update FPS ---
    this.frameCount++;
    const currentFps = deltaTime > 0 ? 1 / deltaTime : 0;
    this.fpsHistory.shift();
    this.fpsHistory.push(currentFps);
    const averageFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

    // --- Update Stats ---
    this.stats.fps = Math.round(averageFps);
    this.stats.frameTime = Math.round(deltaTime * 1000 * 100) / 100; // ms

    // Count gameObjects in the scene
    let gameObjectCount = 0;
    if (this.engine?.currentScene) {
      this.engine.currentScene.traverse((object) => {
        if (object instanceof GameObject) {
          gameObjectCount++;
        }
      });
    }
    this.stats.gameObjects = gameObjectCount;

    const renderSystem = this.engine.systems.get('render');
    const audioSystem = this.engine.systems.get('audio');

    // Count renderables by traversing the scene and counting meshes
    let renderableCount = 0;
    if (this.engine?.currentScene) {
      this.engine.currentScene.traverse((object) => {
        if (object instanceof GameObject) {
          const renderComponent = object?.getComponent('Render');
          if (renderComponent?.enabled && renderComponent.meshes) {
            renderableCount += renderComponent.meshes.length;
          }
        }
      });
    }
    this.stats.renderables = renderableCount;
    this.stats.audioComponents = audioSystem?.audioComponents?.size || 0;

    if (window.performance?.memory) {
      this.stats.memory.used = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
      this.stats.memory.total = Math.round(performance.memory.totalJSHeapSize / (1024 * 1024));
    }
    // ---
  }

  updateDisplay() {
    if (!this.visible || !this.panel) return;

    const renderSystem = this.engine?.systems.get('render');

    // --- Update Panel Content ---
    const statsHtml = `
              FPS: ${this.stats.fps} | Frame: ${this.stats.frameTime}ms<br>
              Objects: ${this.stats.gameObjects} | Renderables: ${this.stats.renderables} | Audio: ${this.stats.audioComponents}<br>
              Memory: ${this.stats.memory.used}MB / ${this.stats.memory.total}MB<br>
              <br>
              Renderer:<br>
              Mode (Alt+R): ${renderSystem?.useComposer ? 'Composer ON' : 'Composer OFF'}<br>
              <br>
              Effects:<br>
              CRT (Alt+C): ${renderSystem?.useCRTEffect ? 'ON' : 'OFF'}<br>
              Outline (Alt+O): ${renderSystem?.useOutlineEffect ? 'ON' : 'OFF'}<br>
              <br>
              Debug View (Alt+W): ${renderSystem?.debugRenderMode || 'N/A'}<br>
              Theme (F2): ${getTheme().name}<br>
              <br>
              Controls (hold Alt):<br>
              Alt+R : Toggle Renderer<br>
              Alt+D : Toggle Debug Panel<br>
              Alt+C : Toggle CRT Effect<br>
              Alt+O : Toggle Outline Effect<br>
              Alt+W : Cycle Debug View (None/Wireframe/Edges)
          `;
    // Update only the stats part, preserving the scene tree container
    const statsContainer = this.panel.firstChild; // Assuming stats are the first child
    if (statsContainer && statsContainer.id !== 'debug-scene-tree') {
      statsContainer.innerHTML = statsHtml;
    } else { // Fallback if structure changed
      this.panel.innerHTML = `<div>${statsHtml}</div>`;
      this.panel.appendChild(this.sceneTreeElement);
    }

    this.updateSceneTree();
  }

  // Helper functions for component status
  getCardStatus(component) {
    return `(${component.suit} ${component.value}, ${component.faceUp ? 'Face Up' : 'Face Down'}${component.held ? ', Held' : ''})`;
  }

  getRenderStatus(component) {
    const meshCount = component.meshes?.length || 0;
    const visibleMeshes = component.meshes?.filter(m => m?.visible)?.length || 0;
    return `(Meshes: ${visibleMeshes}/${meshCount})`;
  }

  getAudioStatus(component) {
    const soundCount = component.sounds?.size || 0;
    return `(Sounds: ${soundCount})`;
  }

  getCardFlipStatus(component) {
    return component.isFlipping ? '(Flipping)' : '';
  }

  getMovementStatus(component) {
    return component.isMoving ? '(Moving)' : '';
  }

  getUIStatus(component) {
    // Get basic mesh information first
    const meshCount = component.meshes?.length || 0;
    const visibleMeshes = component.meshes?.filter(m => m?.visible)?.length || 0;
    let meshInfo = `(Meshes: ${visibleMeshes}/${meshCount}`;
    
    // Add mesh-specific details
    if (meshCount > 0 && component.meshes) {
      let renderOrderInfo = [];
      let materialInfo = [];
      
      component.meshes.forEach((mesh, index) => {
        if (mesh) {
          // Get render order
          renderOrderInfo.push(`${index}:${mesh.renderOrder || 0}`);
          
          // Get material properties
          if (mesh.material) {
            const depthTest = mesh.material.depthTest ? 'T' : 'F';
            const depthWrite = mesh.material.depthWrite ? 'T' : 'F';
            const transparent = mesh.material.transparent ? 'T' : 'F';
            materialInfo.push(`${index}:[${depthTest},${depthWrite},${transparent}]`);
          }
        }
      });
      
      // Add render order info
      if (renderOrderInfo.length > 0) {
        meshInfo += `, RO:[${renderOrderInfo.join(',')}]`;
      }
      
      // Add material properties info (depthTest, depthWrite, transparent)
      if (materialInfo.length > 0) {
        meshInfo += `, M:[${materialInfo.join(',')}]`;
      }
    }
    meshInfo += ')';
    
    // Add component-specific info
    if (component instanceof ButtonComponent) {
      return `(Button: ${component.isInteractable ? 'Active' : 'Disabled'}, w:${component.width}, h:${component.height}) ${meshInfo}`;
    } else if (component instanceof TextDisplayComponent) {
      return `(Text: "${component.text}") ${meshInfo}`;
    }
    
    return `(${component.isInteractable ? 'Active' : 'Disabled'}) ${meshInfo}`;
  }

  getWinDisplayStatus(component) {
    return component.isAnimating ? `(Counting: ${Math.floor(component.currentValue)})` : '';
  }

  getPayTableStatus(component) {
    return component.currentHighlight ? `(Highlighted: ${component.currentHighlight})` : '';
  }

  getParticleStatus(component) {
    return `(Active: ${component.particles?.length || 0})`;
  }

  getScreenShakeStatus(component) {
    return component.duration > 0 ? `(Active: ${Math.round(component.duration * 100) / 100}s)` : '';
  }

  getCameraStatus(component) {
    if (!component.camera) return '';
    
    const camera = component.camera;
    if (camera instanceof THREE.PerspectiveCamera) {
      return `(FOV: ${camera.fov}°, Near: ${camera.near}, Far: ${camera.far})`;
    } else if (camera instanceof THREE.OrthographicCamera) {
      return `(Ortho, Near: ${camera.near}, Far: ${camera.far})`;
    }
    
    return '';
  }

  getComponentStatus(component) {
    const helper = this.componentStatusHelpers.get(component.type);
    if (helper) {
      const status = helper.call(this, component);
      return status ? ` ${status}` : '';
    }
    return '';
  }

  updateSceneTree() {
    if (!this.visible || !this.sceneTreeElement || !this.engine?.currentScene) return;

    // Clear existing content
    this.sceneTreeElement.innerHTML = '';

    // Build scene hierarchy
    const rootContainer = document.createElement('div');
    rootContainer.style.marginLeft = '5px';
    
    // Add scene nodes recursively
    this.buildSceneNode(this.engine.currentScene, rootContainer, 0);
    
    // Add to DOM
    this.sceneTreeElement.appendChild(rootContainer);
  }

  buildSceneNode(object, container, depth) {
    // Skip non-objects or internal objects
    if (!object || !object.type || object.name.startsWith('_')) return;
    
    // Create node element
    const nodeElem = document.createElement('div');
    nodeElem.style.marginLeft = (depth * 12) + 'px';
    nodeElem.style.whiteSpace = 'nowrap';
    
    // Object name and type
    let name = object.name || '(unnamed)';
    if (name.length > 20) name = name.substring(0, 20) + '...';
    
    const objType = object.type;
    const isGameObject = object.components !== undefined;
    
    // Build node content
    let content = `<span style="color: ${isGameObject ? '#ffff00' : '#aaa'}">${name}</span>`;
    
    // Add type info
    content += ` <span style="color: #888">[${objType}]</span>`;
    
    // Add position info if it's a game object
    if (object.position) {
      const pos = object.position;
      const roundedPos = {
        x: Math.round(pos.x * 100) / 100,
        y: Math.round(pos.y * 100) / 100,
        z: Math.round(pos.z * 100) / 100
      };
      content += ` <span style="color: #aaf">(${roundedPos.x}, ${roundedPos.y}, ${roundedPos.z})</span>`;
    }
    
    nodeElem.innerHTML = content;
    container.appendChild(nodeElem);
    
    // If it's a GameObject, show components
    if (isGameObject && object.components && object.components.size > 0) {
      const componentsElem = document.createElement('div');
      componentsElem.style.marginLeft = ((depth + 1) * 12) + 'px';
      componentsElem.style.color = '#0f0';
      
      for (const component of object.components.values()) {
        if (!component) continue;
        
        // Get component display name and status info
        const compType = component.type || component.constructor.name;
        let compStatus = '';
        
        // Use helper function to get detailed status if available
        const statusHelper = this.componentStatusHelpers.get(compType);
        if (statusHelper && typeof statusHelper === 'function') {
          compStatus = statusHelper.call(this, component);
        }
        
        // Create component element
        const compElem = document.createElement('div');
        compElem.innerHTML = `◆ ${compType} ${compStatus}`;
        componentsElem.appendChild(compElem);
      }
      
      container.appendChild(componentsElem);
    }
    
    // Process children
    if (object.children && object.children.length > 0) {
      for (const child of object.children) {
        this.buildSceneNode(child, container, depth + 1);
      }
    }
  }

  getObjectVisibilityStatus(object, camera) {
    if (!object.active) {
      return ' <span style="color:grey;">(GO Inactive)</span>';
    }

    const renderComponent = object.getComponent('Render');
    if (!renderComponent) {
      return '';
    }

    if (!renderComponent.enabled) {
      return ' <span style="color:orange;">(Comp Disabled)</span>';
    }

    if (!renderComponent.meshes || renderComponent.meshes.length === 0) {
      return ' <span style="color:grey;">(No Meshes)</span>';
    }

    if (!camera) {
      return ' <span style="color:yellow;">(No Camera)</span>';
    }

    let isVisible = false;
    for (const mesh of renderComponent.meshes) {
      if (mesh && mesh.visible) {
        mesh.updateMatrixWorld(true);
        this._box.setFromObject(mesh);
        if (!this._box.isEmpty() && this._frustum.intersectsBox(this._box)) {
          isVisible = true;
          break;
        }
      }
    }

    return isVisible ?
      ' <span style="color:lime;">(Visible)</span>' :
      ' <span style="color:red;">(Culled)</span>';
  }

  onDestroy() {
    // Remove panel from DOM
    if (this.panel?.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
      this.panel = null;
      this.sceneTreeElement = null;
    }
    // Remove event listener
    if (this._keydownListener) {
      window.removeEventListener('keydown', this._keydownListener);
      this._keydownListener = null;
    }
  }

  onAdd() {
    super.onAdd();
    
    // Create debug panel UI when added to scene
    this.createPanel();

    // Find the render system when added to a game object
    if (this.engine) {
      const renderSystem = this.engine.systems.get('render');
      if (renderSystem) {
        // If render system is initialized, set up immediately
        if (renderSystem.initialized) {
          this.onRenderSystemReady();
        } else {
          // Otherwise queue for later initialization
          renderSystem.queueComponent(this);
        }
      }
    }
  }

  onRenderSystemReady() {
    // Set up any render-dependent features
    if (this.visible) {
      this.update(0); // Initial update
    }
  }
}

// Factory function to create debug panel
export function createDebugPanel() {
  const debugObject = new GameObject('DebugPanel');
  debugObject.addComponent(new DebugPanelComponent());
  return debugObject;
}

export { DebugPanelComponent };
