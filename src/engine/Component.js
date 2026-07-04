class Component {
    constructor() {
        this.gameObject = null;
        this.enabled = true;
    }

    // The type property that components must override
    get type() {
        throw new Error('Component must implement type property');
    }

    // Lifecycle hooks that components can implement
    onAdd() {}
    onStart() {}
    onRemove() {}
    onDestroy() {}
    update(deltaTime) {}
    fixedUpdate(fixedDeltaTime) {}

    // Utility methods
    getComponent(type) {
        return this.gameObject.getComponent(type);
    }

    get transform() {
        return this.gameObject.transform;
    }

    get engine() {
        return this.gameObject.engine;
    }
}

export default Component;
export { Component };