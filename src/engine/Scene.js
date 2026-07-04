import * as THREE from 'three';
import { GameObject } from './GameObject.js';

class Scene extends THREE.Scene {
  constructor(name = 'Scene') {
    super();
    this.name = name;
    this.engine = null;
    this.loaded = false;
    this.camera = null;

    // Add default ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.add(ambientLight);
  }

  async onLoad(engine) {
    if (this.loaded) return;
    
    this.engine = engine;
    
    // Call the scene's initialization method
    await this.initialize();
    
    // Mark scene as loaded
    this.loaded = true;
  }

  onUnload() {
    if (!this.loaded) return;

    this.cleanup();

    // Get all GameObjects first to ensure proper cleanup
    const gameObjects = [];
    this.traverse((object) => {
      if (object instanceof GameObject) {
        gameObjects.push(object);
      }
    });

    // Destroy all GameObjects
    gameObjects.forEach(obj => obj.destroy());

    // Clean up remaining Three.js objects
    this.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => {
            if (material.map) material.map.dispose();
            material.dispose();
          });
        } else {
          if (object.material.map) object.material.map.dispose();
          object.material.dispose();
        }
      }
    });

    // Clear the scene
    while (this.children.length > 0) {
      this.remove(this.children[0]);
    }

    // Reset state
    this.loaded = false;
    this.engine = null;
  }

  add(object) {
    super.add(object);

    // If the object is a GameObject and we have an engine reference, propagate it
    if (object instanceof GameObject && this.engine) {
      object.engine = this.engine;
    }

    return object;
  }

  // Override these methods in your scene implementations
  initialize() { }
  cleanup() { }
  update(deltaTime) { }
  fixedUpdate(fixedDeltaTime) { }

  findGameObjectByName(name) {
    return this.getObjectByName(name);
  }

  findGameObjectsByType(componentType) {
    const results = [];
    this.traverse((object) => {
      if (object.getComponent && object.getComponent(componentType)) {
        results.push(object);
      }
    });
    return results;
  }

  resize(width, height) {
    if (this.camera && this.camera instanceof THREE.OrthographicCamera) {
      const aspect = width / height;
      this.camera.left = -aspect;
      this.camera.right = aspect;
      this.camera.top = 1;
      this.camera.bottom = -1;
      this.camera.updateProjectionMatrix();
    }
  }
}

export default Scene;
export { Scene };
