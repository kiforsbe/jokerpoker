import * as THREE from 'three';

const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    resolution: { value: new THREE.Vector2() },
    scanlineCount: { value: 800.0 },
    scanlineIntensity: { value: 0.1 },
    noise: { value: 0.02 },
    flicker: { value: 0.01 },
    vignetteIntensity: { value: 0.75 },
    curvature: { value: new THREE.Vector2(2.0, 2.0) }
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float scanlineIntensity;
    uniform float scanlineCount;
    uniform float noise;
    uniform float flicker;
    uniform float vignetteIntensity;
    uniform vec2 curvature;

    varying vec2 vUv;

    float random(vec2 p) {
      vec2 K1 = vec2(23.14069263277926, 2.665144142690225);
      return fract(cos(dot(p, K1)) * 12345.6789);
    }

    vec2 curveRemapUV(vec2 uv) {
      uv = uv * 2.0 - 1.0;
      vec2 offset = abs(uv.yx) / curvature;
      uv = uv + uv * offset * offset;
      uv = uv * 0.5 + 0.5;
      return uv;
    }

    vec3 scanlines(vec2 uv, vec3 col) {
      float scanline = sin(uv.y * scanlineCount * 3.14159 * 2.0) * 0.5 + 0.5;
      scanline = pow(scanline, 1.7);
      col *= 1.0 - (scanlineIntensity - scanlineIntensity * scanline);
      return col;
    }

    vec3 rgbShift(sampler2D tex, vec2 uv, float amount) {
      vec3 col;
      col.r = texture2D(tex, vec2(uv.x + amount, uv.y)).r;
      col.g = texture2D(tex, uv).g;
      col.b = texture2D(tex, vec2(uv.x - amount, uv.y)).b;
      return col;
    }

    void main() {
      // Apply screen curvature
      vec2 uv = curveRemapUV(vUv);

      // Discard pixels outside curved screen
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      
      // RGB shift and color
      vec3 col = rgbShift(tDiffuse, uv, 0.002);
      
      // Apply scanlines
      col = scanlines(uv, col);
      
      // Add noise
      float noiseVal = random(uv + time) * noise;
      col += noiseVal;
      
      // Add screen flicker
      float flickerVal = sin(time * 60.0) * flicker;
      col *= 1.0 + flickerVal;
      
      // Apply vignette
      float vignette = 1.0 - length((uv - 0.5) * 2.0) * vignetteIntensity;
      col *= vignette;

      // Use alpha from original texture
      float alpha = texture2D(tDiffuse, uv).a;
      
      gl_FragColor = vec4(col, alpha);
    }
  `
};

export default CRTShader;
export { CRTShader };
