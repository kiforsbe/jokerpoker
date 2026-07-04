import * as THREE from 'three';

class GameObject extends THREE.Object3D {
  constructor(name = 'GameObject') {
    super();
    this.name = name;
    this.components = new Map();
    this.engine = null;
    this._active = true;
    this._destroyed = false;
  }

  get active() {
    return this._active;
  }

  set active(value) {
    this._active = value;
    this.visible = value;
    // Propagate active state to children
    this.traverse((child) => {
      if (child instanceof GameObject) {
        child._active = value;
        child.visible = value;
      }
    });
  }

  addComponent(component) {
    if (this._destroyed) {
      console.warn('Cannot add component to destroyed GameObject');
      return null;
    }

    if (!component.type) {
      throw new Error('Component must have a type');
    }

    if (this.components.has(component.type)) {
      throw new Error(`GameObject already has component of type ${component.type}`);
    }

    // Ensure transform is initialized
    if (!this.position) {
      this.position = new THREE.Vector3();
    }

    this.components.set(component.type, component);
    component.gameObject = this;  // The transform will be accessible via the gameObject reference

    // Only call onAdd if engine is already available
    if (this.engine && component.onAdd) {
      component.onAdd();
    }

    if (this.engine && component.onStart) {
      component.onStart();
    }

    return component;
  }

  removeComponent(type) {
    const component = this.components.get(type);
    if (!component) return;

    if (component.onRemove) {
      component.onRemove();
    }

    this.components.delete(type);
    component.gameObject = null;
  }

  getComponent(type) {
    return this.components.get(type);
  }

  hasComponent(type) {
    return this.components.has(type);
  }

  update(deltaTime) {
    if (!this._active || this._destroyed) return;

    // Update components
    for (const component of this.components.values()) {
      if (component.enabled && component.update) {
        component.update(deltaTime);
      }
    }

    // Update matrix only if needed
    if (this.matrixAutoUpdate) {
      this.updateMatrix();
    }

    // Update children
    this.children.forEach(child => {
      if (child instanceof GameObject && child.update) {
        child.update(deltaTime);
      }
    });
  }

  fixedUpdate(fixedDeltaTime) {
    if (!this._active || this._destroyed) return;

    // Update components
    for (const component of this.components.values()) {
      if (component.enabled && component.fixedUpdate) {
        component.fixedUpdate(fixedDeltaTime);
      }
    }

    // Update children
    this.children.forEach(child => {
      if (child instanceof GameObject && child.fixedUpdate) {
        child.fixedUpdate(fixedDeltaTime);
      }
    });
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    // First destroy all child game objects
    const childGameObjects = this.children.filter(child => child instanceof GameObject);
    childGameObjects.forEach(child => child.destroy());

    // Remove all other children that aren't GameObjects
    while (this.children.length > 0) {
      const child = this.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      this.remove(child);
    }

    // Clean up all components
    for (const [type, component] of this.components) {
      if (component.onDestroy) {
        component.onDestroy();
      }
      if (component.onRemove) {
        component.onRemove();
      }
    }
    this.components.clear();

    // Remove from parent
    if (this.parent) {
      this.parent.remove(this);
    }

    // Clean up own resources if any
    if (this.geometry) this.geometry.dispose();
    if (this.material) {
      if (Array.isArray(this.material)) {
        this.material.forEach(m => m.dispose());
      } else {
        this.material.dispose();
      }
    }
  }
}

export default GameObject;
export { GameObject };
