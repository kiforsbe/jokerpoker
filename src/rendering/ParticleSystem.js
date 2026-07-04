import RenderComponent from './RenderComponent.js';
import { GameObject } from '../engine/GameObject.js';
import { GameAudioComponent } from '../audio/AudioComponent.js';

class Particle {
    constructor(position, velocity, color, life, size) {
        this.position = { ...position };
        this.velocity = { ...velocity };
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = size;
    }

    update(deltaTime) {
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.life -= deltaTime;
        return this.life > 0;
    }
}

class ParticleEmitter extends RenderComponent {
    constructor() {
        super();
        this.particles = [];
        this.isEmitting = false;
        this.emitRate = 10;
        this.emitTimer = 0;
        this.duration = 0;
        this.audioComponent = null;
    }

    get type() {
        return 'ParticleEmitter';
    }

    onStart() {
        this.audioComponent = this.gameObject.addComponent(new GameAudioComponent());
    }

    emit(options = {}) {
        const {
            count = 20,
            duration = 1,
            color = 0xffff00,
            minVelocity = { x: -2, y: -2 },
            maxVelocity = { x: 2, y: 2 },
            minLife = 0.5,
            maxLife = 1.5,
            minSize = 0.02,
            maxSize = 0.05
        } = options;

        this.isEmitting = true;
        this.duration = duration;
        this.emitRate = count / duration;

        // Play burst sound when particles start emitting
        if (this.audioComponent) {
            this.audioComponent.playBurst();
        }

        // Create initial burst
        for (let i = 0; i < count / 3; i++) {
            this.createParticle(minVelocity, maxVelocity, minLife, maxLife, minSize, maxSize, color);
        }
    }

    // Particles are added as children of this emitter's GameObject, which burstAt()
    // moves to the burst location, so each particle starts at the local origin.
    getParticleStartPosition() {
        return { x: 0, y: 0 };
    }

    createParticle(minVelocity, maxVelocity, minLife, maxLife, minSize, maxSize, color) {
        const position = this.getParticleStartPosition();

        const velocity = {
            x: minVelocity.x + Math.random() * (maxVelocity.x - minVelocity.x),
            y: minVelocity.y + Math.random() * (maxVelocity.y - minVelocity.y)
        };

        const life = minLife + Math.random() * (maxLife - minLife);
        const size = minSize + Math.random() * (maxSize - minSize);

        const particle = new Particle(position, velocity, color, life, size);
        this.particles.push(particle);

        // Create particle mesh. createRect() already pushes the mesh into this.meshes,
        // so do NOT push again — a second push desyncs particles[] from meshes[] and
        // leaves orphaned meshes that never get removed (particles "stuck" on screen).
        const mesh = this.createRect(size, size, color);
        mesh.material.transparent = true;
    }

    update(deltaTime) {
        // Update emission
        if (this.isEmitting) {
            this.duration -= deltaTime;
            this.emitTimer += deltaTime;

            while (this.emitTimer >= 1 / this.emitRate) {
                this.createParticle(
                    { x: -2, y: -2 },
                    { x: 2, y: 2 },
                    0.5,
                    1.5,
                    0.02,
                    0.05,
                    0xffff00
                );
                this.emitTimer -= 1 / this.emitRate;
            }

            if (this.duration <= 0) {
                this.isEmitting = false;
            }
        }

        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            const mesh = this.meshes[i];

            if (!particle.update(deltaTime)) {
                // Remove dead particles
                this.particles.splice(i, 1);
                this.meshes.splice(i, 1);
                mesh.parent.remove(mesh);
                continue;
            }

            // Update particle mesh
            mesh.position.x = particle.position.x;
            mesh.position.y = particle.position.y;
            mesh.material.opacity = particle.life / particle.maxLife;
        }
    }

    burstAt(position, options = {}) {
        this.gameObject.position.x = position.x;
        this.gameObject.position.y = position.y;
        this.emit(options);
    }

    stop() {
        this.isEmitting = false;
    }
}

// Factory function to create a particle emitter
export function createParticleEmitter() {
    const emitterObject = new GameObject('ParticleEmitter');
    emitterObject.addComponent(new ParticleEmitter());
    return emitterObject;
}

export { ParticleEmitter };