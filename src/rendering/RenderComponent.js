import * as THREE from 'three';
import Component from '../engine/Component.js';
import { textureFilter } from './theme.js';

class RenderComponent extends Component {
  constructor() {
    super();
    this._renderSystem = null;
    this.meshes = [];
  }

  get type() {
    return 'Render';
  }

  onAdd() {
    // Find the render system when added to a game object
    if (this.engine) {
      this._renderSystem = this.engine.systems.get('render');
      if (this._renderSystem) {
        if (this._renderSystem.initialized) {
          // Call immediately if system is already initialized
          this.onRenderSystemReady();
        } else {
          // Queue for initialization when system is ready
          this._renderSystem.queueComponent(this);
        }
      } else {
        console.warn(`RenderComponent added to ${this.gameObject?.name || 'unknown'} but no render system found`);
      }
    } else {
      console.warn(`RenderComponent added to ${this.gameObject?.name || 'unknown'} but no engine reference`);
    }
  }

  onRenderSystemReady() {
    // Override in derived classes to create and add meshes
  }

  onRemove() {
    // Clean up Three.js resources
    this.meshes.forEach(mesh => {
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        // Handle material cleanup
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(material => {
            if (material.map) material.map.dispose();
            material.dispose();
          });
        } else {
          if (mesh.material.map) mesh.material.map.dispose();
          mesh.material.dispose();
        }
      }
      // Remove from parent
      mesh.parent?.remove(mesh);
    });
    this.meshes = [];
  }

  createSprite(texture, width, height) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Don't test against depth buffer
      depthWrite: false // Don't write to depth buffer
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.gameObject.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  createTextSprite(text, color = '#ffffff', size = 32, font = 'monospace') {
    const texture = this._renderSystem.createCanvasTexture(256, 64, (context) => {
      context.fillStyle = color;
      context.font = `${size}px ${font}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 128, 32);
    });
    return this.createSprite(texture, 1, 0.25);
  }

  createRect(width, height, color) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true, // Don't test against depth buffer
      depthTest: false, // Don't test against depth buffer
      depthWrite: false // Don't write to depth buffer
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.gameObject.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  updateTexture(mesh, drawCallback) {
    if (!mesh.material.map) return;

    const canvas = mesh.material.map.image;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawCallback(context, canvas);
    // Keep the sampling filter in step with the active theme (nearest in
    // retro, linear in hires) — redraws are how theme toggles propagate.
    mesh.material.map.minFilter = mesh.material.map.magFilter = textureFilter();
    mesh.material.map.needsUpdate = true;
  }

  raycast(raycaster) {
    const intersects = [];
    this.meshes.forEach(mesh => {
      if (mesh.visible && mesh.geometry) {
        // Update the mesh's matrixWorld if needed
        if (mesh.matrixWorldNeedsUpdate) {
          mesh.updateMatrixWorld(true);
        }
        const meshIntersects = raycaster.intersectObject(mesh);
        intersects.push(...meshIntersects);
      }
    });
    // Sort intersections by distance
    intersects.sort((a, b) => a.distance - b.distance);
    return intersects;
  }

  handleClick(raycaster) {
    const intersects = this.raycast(raycaster);
    if (intersects.length > 0) {
      // Default implementation just logs the click
      console.debug(`Clicked on ${this.type} of ${this.gameObject.name}`);
      return true;
    }
    return false;
  }
}

export default RenderComponent;
export { RenderComponent };
