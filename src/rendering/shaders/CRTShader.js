import * as THREE from 'three';

const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    sourceResolution: { value: new THREE.Vector2() },
    presentationResolution: { value: new THREE.Vector2() },
    scanlineDensity: { value: 0.0 },
    rgbShiftPixels: { value: 0.0 },
    scanlineIntensity: { value: 0.1 },
    noise: { value: 0.02 },
    flicker: { value: 0.01 },
    vignetteIntensity: { value: 0.75 },
    brightness: { value: 1.0 },
    saturation: { value: 1.0 },
    curvature: { value: new THREE.Vector2(2.0, 2.0) },
    cornerRadius: { value: 0.04 }
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
    uniform vec2 sourceResolution;
    uniform vec2 presentationResolution;
    uniform float scanlineIntensity;
    uniform float scanlineDensity;
    uniform float rgbShiftPixels;
    uniform float noise;
    uniform float flicker;
    uniform float vignetteIntensity;
    uniform float brightness;
    uniform float saturation;
    uniform vec2 curvature;
    uniform float cornerRadius;

    varying vec2 vUv;

    float random(vec2 p) {
      vec2 K1 = vec2(23.14069263277926, 2.665144142690225);
      return fract(cos(dot(p, K1)) * 12345.6789);
    }

    float smoothNoise(vec2 p) {
      vec2 cell = floor(p);
      vec2 fraction = fract(p);
      fraction = fraction * fraction * (3.0 - 2.0 * fraction);
      float a = random(cell);
      float b = random(cell + vec2(1.0, 0.0));
      float c = random(cell + vec2(0.0, 1.0));
      float d = random(cell + vec2(1.0, 1.0));
      return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
    }

    vec2 curveRemapUV(vec2 uv) {
      uv = uv * 2.0 - 1.0;
      vec2 offset = abs(uv.yx) / curvature;
      uv = uv + uv * offset * offset;
      uv = uv * 0.5 + 0.5;
      return uv;
    }

    vec3 scanlines(vec2 uv, vec3 col) {
      float scanlineCount = sourceResolution.y * scanlineDensity;
      float scanline = sin(uv.y * scanlineCount * 3.14159 * 2.0);
      col *= 1.0 + scanlineIntensity * scanline;
      return col;
    }

    float roundedScreenMask(vec2 uv) {
      float radius = max(cornerRadius, 0.0);
      if (radius == 0.0) return 1.0;
      vec2 p = abs(uv - 0.5);
      vec2 q = p - (vec2(0.5) - vec2(radius));
      float distanceToEdge = length(max(q, 0.0))
        + min(max(q.x, q.y), 0.0) - radius;
      float feather = 1.5 / max(min(presentationResolution.x, presentationResolution.y), 1.0);
      return 1.0 - smoothstep(-feather, feather, distanceToEdge);
    }

    vec3 rgbShift(vec2 uv, float amount) {
      vec3 col;
      col.r = texture2D(tDiffuse, vec2(uv.x + amount, uv.y)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, vec2(uv.x - amount, uv.y)).b;
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
      vec3 col = rgbShift(uv, rgbShiftPixels / max(sourceResolution.x, 1.0));
      
      // Apply scanlines
      col = scanlines(uv, col);
      
      // Add noise
      float noiseVal = (smoothNoise(uv * presentationResolution * 0.08 + vec2(time * 0.5, 0.0)) - 0.5) * noise;
      col += noiseVal;
      
      // Add screen flicker
      float flickerVal = sin(time * 60.0) * flicker;
      col *= 1.0 + flickerVal;

      float luminance = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luminance), col, saturation) * brightness;
      
      // Darken only the extreme glass edge; keep the main image at its
      // authored luminance and saturation.
      float edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      float edgeFalloff = 1.0 - smoothstep(0.0, 0.12, edgeDistance);
      float vignette = 1.0 - edgeFalloff * vignetteIntensity;
      col *= vignette;

      // Give each CRT generation a real rounded tube silhouette independent
      // of the barrel-warp strength.
      col *= roundedScreenMask(vUv);

      // The CRT presents an opaque screen. Intermediate composer targets can
      // carry an undefined alpha channel after a resize; forwarding it would
      // make the browser composite an otherwise valid frame over black.
      gl_FragColor = vec4(col, 1.0);
    }
  `
};

export default CRTShader;
export { CRTShader };
