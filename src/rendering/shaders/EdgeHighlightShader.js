// c:\Users\Kim Forsberg\source\repos\joker_poker\src\rendering\shaders\EdgeHighlightShader.js
import * as THREE from 'three';

const EdgeHighlightShader = {
  uniforms: {
    // Input texture (though this shader doesn't strictly need it,
    // ShaderPass might require tDiffuse)
    tDiffuse: { value: null },
    // Custom uniforms for edge highlighting
    edgeColor: { value: new THREE.Color(0x00ff00) }, // Default: Bright Green
    edgePower: { value: 3.0 }, // Controls sharpness (higher = sharper)
    edgeBias: { value: 0.2 }  // Controls falloff start (0.0 to 1.0)
  },

  vertexShader: `
    // Varyings to pass data to the fragment shader
    varying vec3 vNormal;       // World-space normal
    varying vec3 vViewPosition; // Vector from surface point to camera

    void main() {
        // Calculate world-space position of the vertex
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);

        // Calculate world-space normal
        // Use normalMatrix for robustness against non-uniform scaling
        vec3 worldNormal = normalize( normalMatrix * normal );

        // Calculate the view direction (vector from surface point to camera)
        vec3 viewDirection = normalize(cameraPosition - worldPosition.xyz);

        // Pass calculated values to the fragment shader
        vNormal = worldNormal;
        vViewPosition = viewDirection;

        // Standard Three.js position calculation
        // Use modelViewMatrix for compatibility with standard rendering pipeline
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    // Uniforms received from the application
    uniform vec3 edgeColor; // The color of the highlight
    uniform float edgePower; // Controls the sharpness/thickness
    uniform float edgeBias;  // Controls where the effect starts

    // Varyings received from the vertex shader
    varying vec3 vNormal;       // Interpolated world-space normal
    varying vec3 vViewPosition; // Interpolated vector from surface to camera

    void main() {
        // Normalize the interpolated vectors
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        // Calculate the dot product between the normal and view direction.
        // A value close to 0 means the surface is perpendicular to the view (grazing angle).
        // A value close to 1 means the surface is facing the view directly.
        float dotNV = dot(normal, viewDir);

        // Fresnel term: We want effect at grazing angles (dotNV close to 0).
        // Use 1.0 - dotNV for a rim light effect.
        float fresnelFactor = 1.0 - dotNV;

        // Clamp fresnelFactor before pow to avoid issues if dotNV > 1 slightly due to precision
        fresnelFactor = clamp(fresnelFactor, 0.0, 1.0);

        // Apply power to control the sharpness/falloff
        fresnelFactor = pow(fresnelFactor, edgePower);

        // Use smoothstep to create a smoother transition based on the bias
        // This maps the fresnelFactor range [edgeBias, 1.0] to [0.0, 1.0] smoothly.
        float edgeIntensity = smoothstep(edgeBias, 1.0, fresnelFactor);

        // Output the edge color with intensity, discarding non-edge pixels.
        if (edgeIntensity > 0.01) { // Use a small threshold to avoid faint edges everywhere
            // Optional: Make edge slightly transparent
            gl_FragColor = vec4(edgeColor, edgeIntensity * 0.8);
        } else {
            // Discard fragments that are not part of the edge highlight
            discard;
        }
    }
  `
};

export default EdgeHighlightShader;
export { EdgeHighlightShader };
