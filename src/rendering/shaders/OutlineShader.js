// c:\Users\Kim Forsberg\source\repos\joker_poker\src\rendering\shaders\OutlineShader.js
import * as THREE from 'three';

const OutlineShader = {
  uniforms: {
    tDiffuse: { value: null }, // Scene texture
    tDepth: { value: null },   // Depth texture
    cameraNear: { value: 0.1 }, // Camera near plane
    cameraFar: { value: 100 },  // Camera far plane
    resolution: { value: new THREE.Vector2() }, // Viewport resolution
    outlineColor: { value: new THREE.Color(0x00ff00) }, // Outline color (e.g., green)
    outlineThickness: { value: 1.5 }, // Thickness factor
    depthSensitivity: { value: 0.05 } // How sensitive to depth changes (lower = more sensitive)
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    #include <packing> // For unpackRGBAToDepth

    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec2 resolution;
    uniform vec3 outlineColor;
    uniform float outlineThickness;
    uniform float depthSensitivity;

    // Function to read depth buffer value
    float readDepth(sampler2D depthSampler, vec2 coord) {
      float fragCoordZ = texture2D(depthSampler, coord).x; // Assuming depth is in R channel
      // If using RGBA packed depth, use:
      // float fragCoordZ = unpackRGBAToDepth(texture2D(depthSampler, coord));
      float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
      return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar); // Convert to linear depth [0, 1]
    }

    void main() {
      vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);

      // Sample depth in a 3x3 grid around the current pixel
      float depth = readDepth(tDepth, vUv);
      float depthN = readDepth(tDepth, vUv + vec2(0.0, texel.y * outlineThickness));
      float depthS = readDepth(tDepth, vUv - vec2(0.0, texel.y * outlineThickness));
      float depthW = readDepth(tDepth, vUv - vec2(texel.x * outlineThickness, 0.0));
      float depthE = readDepth(tDepth, vUv + vec2(texel.x * outlineThickness, 0.0));

      // Sobel filter variation for edge detection on depth
      float horizontalEdge = abs((depthN + 2.0 * depth + depthS) - (depthN + 2.0 * depth + depthS)); // Simplified, check neighbors
      float verticalEdge = abs((depthW + 2.0 * depth + depthE) - (depthW + 2.0 * depth + depthE)); // Simplified, check neighbors

      // More direct neighbor comparison
      float depthDiffH = abs(depthE - depthW);
      float depthDiffV = abs(depthN - depthS);

      // Calculate edge strength based on depth differences
      float edgeFactor = sqrt(pow(depthDiffH, 2.0) + pow(depthDiffV, 2.0));

      // Get the original scene color
      vec4 diffuseColor = texture2D(tDiffuse, vUv);

      // If edge strength exceeds sensitivity threshold, draw outline
      if (edgeFactor > depthSensitivity) {
          // Mix outline color with diffuse color based on edge strength (optional)
          // float mixFactor = smoothstep(depthSensitivity, depthSensitivity * 2.0, edgeFactor);
          // gl_FragColor = mix(diffuseColor, vec4(outlineColor, diffuseColor.a), mixFactor);

          // Or just draw the outline color directly
          gl_FragColor = vec4(outlineColor, diffuseColor.a); // Use diffuse alpha
      } else {
          // Otherwise, draw the original scene color
          gl_FragColor = diffuseColor;
      }
    }
  `
};

export { OutlineShader };
