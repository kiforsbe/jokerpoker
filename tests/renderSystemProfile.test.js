import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RenderSystem from '../src/rendering/RenderSystem.js';
import RenderComponent from '../src/rendering/RenderComponent.js';
import Scene from '../src/engine/Scene.js';
import { TextureRasterizer } from '../src/rendering/TextureRasterizer.js';
import { DISPLAY_PROFILES, SCREEN_ASPECT } from '../src/rendering/displayProfiles.js';
import { ButtonComponent, TextDisplayComponent } from '../src/rendering/UIComponent.js';
import { TickerComponent } from '../src/rendering/TickerComponent.js';
import { CRTShader } from '../src/rendering/shaders/CRTShader.js';

globalThis.window ??= {};

test('depth outline is disabled by default', () => {
  const system = new RenderSystem({ systems: new Map() });

  assert.equal(system.useOutlineEffect, false);
  assert.equal(system.shaderParams.outline.enabled, false);
});

test('outline debug toggle persists its state for pass rebuilds', () => {
  const system = new RenderSystem({ systems: new Map() });
  system.outlinePass = { enabled: false };

  system.toggleOutlineEffect(true);

  assert.equal(system.useOutlineEffect, true);
  assert.equal(system.shaderParams.outline.enabled, true);
  assert.equal(system.outlinePass.enabled, true);

  system.outlinePass = { enabled: system.shaderParams.outline.enabled };
  assert.equal(system.outlinePass.enabled, true);

  system.toggleOutlineEffect(false);
  assert.equal(system.useOutlineEffect, false);
  assert.equal(system.shaderParams.outline.enabled, false);
  assert.equal(system.outlinePass.enabled, false);
});

test('CRT shader separates native source dimensions from final presentation dimensions', () => {
  assert.ok(CRTShader.uniforms.sourceResolution);
  assert.ok(CRTShader.uniforms.presentationResolution);
  assert.ok(CRTShader.uniforms.brightness);
  assert.ok(CRTShader.uniforms.saturation);
  assert.equal(CRTShader.uniforms.resolution, undefined);
  assert.match(CRTShader.fragmentShader, /sourceResolution\.y\s*\*\s*scanlineDensity/);
  assert.match(CRTShader.fragmentShader, /rgbShiftPixels\s*\/\s*max\(sourceResolution\.x/);
  assert.match(CRTShader.fragmentShader, /smoothNoise\(uv\s*\*\s*presentationResolution/);
  assert.match(CRTShader.fragmentShader, /uniform\s+float\s+cornerRadius/);
  assert.match(CRTShader.fragmentShader, /roundedScreenMask\s*\(/);
  assert.match(CRTShader.fragmentShader, /1\.0\s*\+\s*scanlineIntensity\s*\*\s*scanline/);
  assert.doesNotMatch(CRTShader.fragmentShader, /col\s*\*=\s*1\.0\s*-\s*\(scanlineIntensity/);
  assert.match(CRTShader.fragmentShader, /gl_FragColor\s*=\s*vec4\(col,\s*1\.0\)/);
});

test('CRT RGB separation avoids sampler parameters rejected by WebGL drivers', () => {
  assert.doesNotMatch(CRTShader.fragmentShader, /rgbShift\s*\(\s*sampler2D/);
  assert.match(CRTShader.fragmentShader, /vec3\s+rgbShift\s*\(\s*vec2\s+uv/);
});

function makeProfileSystem(container = { clientWidth: 1200, clientHeight: 700 }) {
  const system = new RenderSystem({ systems: new Map() });
  const calls = [];
  system.renderer = {
    domElement: { style: {}, parentElement: container },
    setPixelRatio: value => calls.push(['dpr', value]),
    setSize: (width, height, updateStyle) => {
      system.renderer.lastSize = { width, height };
      calls.push(['renderer', width, height, updateStyle]);
    },
  };
  system.composer = {
    renderTarget1: { texture: {} },
    renderTarget2: { texture: {} },
    readBuffer: { texture: {} },
    writeBuffer: { texture: {} },
    setPixelRatio: value => calls.push(['composerDpr', value]),
    setSize: (...args) => calls.push(['composer', ...args]),
  };
  system.presentationComposer = {
    setPixelRatio: value => calls.push(['presentationComposerDpr', value]),
    setSize: (...args) => calls.push(['presentationComposer', ...args]),
  };
  system.presentationPass = { map: null };
  system.outlinePass = {
    uniforms: { resolution: { value: { set: (...args) => calls.push(['outline', ...args]) } } },
  };
  system.crtPass = {
    enabled: false,
    uniforms: {
      sourceResolution: { value: { set: (x, y) => calls.push(['crtSourceResolution', x, y]) } },
      presentationResolution: { value: { set: (x, y) => calls.push(['crtPresentationResolution', x, y]) } },
      scanlineDensity: { value: 0 },
      scanlineIntensity: { value: 0 },
      rgbShiftPixels: { value: 0 },
      noise: { value: 0 },
      flicker: { value: 0 },
      vignetteIntensity: { value: 0 },
      brightness: { value: 0 },
      saturation: { value: 0 },
      curvature: { value: {
        set: (x, y) => calls.push(['curvature', x, y]),
        copy: ({ x, y }) => calls.push(['curvatureCopy', x, y]),
      } },
      cornerRadius: { value: 0 },
    },
  };
  return { system, calls };
}

test('applies exact logical and presentation sizes, filters, composers, and CRT uniforms', () => {
  const { system, calls } = makeProfileSystem();

  system.applyDisplayProfile(DISPLAY_PROFILES.nineties);

  assert.deepEqual(system.renderer.lastSize, { width: 932, height: 699 });
  assert.ok(calls.some(call => call.join(':') === 'composer:800:600'));
  assert.ok(calls.some(call => call.join(':') === 'presentationComposer:932:699'));
  assert.ok(calls.some(call => call.join(':') === 'outline:800:600'));
  assert.ok(calls.some(call => call.join(':') === 'crtSourceResolution:800:600'));
  assert.ok(calls.some(call => call.join(':') === 'crtPresentationResolution:932:699'));
  assert.ok(calls.some(call => call.join(':') === 'dpr:1'));
  assert.ok(calls.some(call => call.join(':') === 'composerDpr:1'));
  assert.ok(calls.some(call => call.join(':') === 'presentationComposerDpr:1'));
  assert.equal(system.renderer.domElement.style.width, '932px');
  assert.equal(system.renderer.domElement.style.height, '699px');
  assert.equal(system.renderer.domElement.style.imageRendering, 'pixelated');
  assert.equal(system.composer.renderTarget1.texture.minFilter, THREE.NearestFilter);
  assert.equal(system.composer.renderTarget1.texture.magFilter, THREE.NearestFilter);
  assert.equal(system.composer.renderTarget2.texture.minFilter, THREE.NearestFilter);
  assert.equal(system.composer.readBuffer.texture.minFilter, THREE.NearestFilter);
  assert.equal(system.composer.writeBuffer.texture.magFilter, THREE.NearestFilter);
  assert.equal(system.composer.renderTarget1.texture.needsUpdate, true);
  assert.equal(system.crtPass.enabled, true);
  assert.equal(system.crtPass.uniforms.scanlineDensity.value, 0.8);
  assert.equal(system.crtPass.uniforms.scanlineIntensity.value, 0.14);
  assert.equal(system.crtPass.uniforms.rgbShiftPixels.value, 0.45);
  assert.ok(calls.some(call => call.join(':') === 'curvature:6.5:6.5'));
  assert.equal(system.crtPass.uniforms.cornerRadius.value, 0.035);
});

test('CRT presets set every generic uniform and fully reset disabled early-2000s output', () => {
  const { system, calls } = makeProfileSystem();

  system.applyDisplayProfile(DISPLAY_PROFILES.eighties);
  assert.equal(system.crtPass.enabled, true);
  assert.ok(calls.some(call => call.join(':') === 'crtSourceResolution:640:480'));
  assert.ok(calls.some(call => call.join(':') === 'crtPresentationResolution:932:699'));
  assert.equal(system.crtPass.uniforms.scanlineDensity.value, 0.45);
  assert.equal(system.crtPass.uniforms.scanlineIntensity.value, 0.35);
  assert.equal(system.crtPass.uniforms.rgbShiftPixels.value, 1.5);
  assert.equal(system.crtPass.uniforms.noise.value, 0);
  assert.equal(system.crtPass.uniforms.flicker.value, 0.012);
  assert.equal(system.crtPass.uniforms.vignetteIntensity.value, 0.07);
  assert.equal(system.crtPass.uniforms.brightness.value, 1);
  assert.equal(system.crtPass.uniforms.saturation.value, 1);
  assert.equal(system.crtPass.uniforms.cornerRadius.value, 0.15);

  system.applyDisplayProfile(DISPLAY_PROFILES.early2000s);
  assert.equal(system.crtPass.enabled, false);
  for (const uniform of ['scanlineDensity', 'scanlineIntensity', 'rgbShiftPixels', 'noise', 'flicker', 'vignetteIntensity', 'cornerRadius']) {
    assert.equal(system.crtPass.uniforms[uniform].value, 0, uniform);
  }
  assert.equal(system.crtPass.uniforms.brightness.value, 1);
  assert.equal(system.crtPass.uniforms.saturation.value, 1);
  assert.ok(calls.some(call => call.join(':') === 'curvature:1000:1000'));
});

test('live CRT tuning updates brightness and saturation uniforms', () => {
  const { system } = makeProfileSystem();
  system.activeDisplayProfile = DISPLAY_PROFILES.eighties;

  system.setCRTParameters({ brightness: 1.2, saturation: 1.35 });

  assert.equal(system.crtPass.uniforms.brightness.value, 1.2);
  assert.equal(system.crtPass.uniforms.saturation.value, 1.35);
});

test('live curvature tuning preserves the mutable vector used by era changes', () => {
  const { system } = makeProfileSystem();
  const curvature = system.shaderParams.crt.curvature;

  system.setCRTParameters({ curvature: { x: 7.25, y: 8.5 } });

  assert.equal(system.shaderParams.crt.curvature, curvature);
  assert.deepEqual(curvature.toArray(), [7.25, 8.5]);
  system.applyDisplayProfile(DISPLAY_PROFILES.nineties);
  assert.deepEqual(curvature.toArray(), [6.5, 6.5]);
});

test('all display profiles select fixed logical framebuffers and generic output sampling', () => {
  const { system } = makeProfileSystem({ clientWidth: 1600, clientHeight: 1200 });
  for (const [profile, expectedSize, expectedOutput, expectedFilter] of [
    [DISPLAY_PROFILES.eighties, { width: 640, height: 480 }, 'pixelated', THREE.NearestFilter],
    [DISPLAY_PROFILES.nineties, { width: 800, height: 600 }, 'pixelated', THREE.NearestFilter],
    [DISPLAY_PROFILES.early2000s, { width: 1024, height: 768 }, 'auto', THREE.LinearFilter],
  ]) {
    system.applyDisplayProfile(profile);
    assert.deepEqual(system.renderer.lastSize, { width: 1600, height: 1200 });
    assert.deepEqual(system._renderSize(), expectedSize);
    assert.equal(system.renderer.domElement.style.imageRendering, expectedOutput);
    assert.equal(system.composer.renderTarget1.texture.minFilter, expectedFilter);
  }
});

test('host resize changes only presentation dimensions and preserves logical framebuffer', () => {
  const container = { clientWidth: 1200, clientHeight: 700 };
  const { system, calls } = makeProfileSystem(container);
  system.applyDisplayProfile(DISPLAY_PROFILES.early2000s);
  calls.length = 0;
  container.clientWidth = 700;
  container.clientHeight = 900;

  system.resize();

  assert.equal(system.renderer.domElement.style.width, '700px');
  assert.equal(system.renderer.domElement.style.height, '525px');
  assert.deepEqual(system.renderer.lastSize, { width: 700, height: 525 });
  assert.ok(calls.some(call => call.join(':') === 'presentationComposer:700:525'));
  assert.equal(calls.some(call => call.join(':') === 'composer:1024:768'), false);
  assert.ok(calls.some(call => call.join(':') === 'renderer:700:525:false'));
  assert.equal(calls.some(call => call[0] === 'composer'), false);
});

test('scene assignment preserves logical composer targets and pass order', () => {
  const { system, calls } = makeProfileSystem();
  system.applyDisplayProfile(DISPLAY_PROFILES.nineties);
  calls.length = 0;

  const renderPass = {};
  system.renderPass = renderPass;
  system.composer.passes = [renderPass, system.outlinePass];
  system.composer.reset = () => {
    calls.push(['composerReset']);
    system.composer.setSize(
      system.renderer.lastSize.width,
      system.renderer.lastSize.height,
    );
  };
  system.composer.addPass = pass => system.composer.passes.push(pass);
  const scene = {
    camera: {},
    resize: (width, height) => calls.push(['scene', width, height]),
  };

  system.setActiveScene(scene);

  assert.equal(calls.some(call => call[0] === 'composerReset'), false);
  assert.equal(calls.some(call => call.join(':') === 'composer:932:699'), false);
  assert.deepEqual(system.composer.passes, [renderPass, system.outlinePass]);
  assert.equal(system.renderPass.scene, scene);
  assert.equal(system.renderPass.camera, scene.camera);
  assert.ok(calls.some(call => call.join(':') === 'scene:800:600'));
});

test('direct rendering resize keeps the logical framebuffer while refitting CSS', () => {
  const container = { clientWidth: 1200, clientHeight: 700 };
  const { system, calls } = makeProfileSystem(container);
  system.forceDirectRendering(DISPLAY_PROFILES.early2000s);
  calls.length = 0;
  container.clientWidth = 700;
  container.clientHeight = 900;

  system.resize();

  assert.deepEqual(system.renderer.lastSize, { width: 1024, height: 768 });
  assert.equal(system.renderer.domElement.style.width, '700px');
  assert.equal(system.renderer.domElement.style.height, '525px');
  assert.equal(calls.some(call => call[0] === 'renderer'), false);
  assert.equal(calls.some(call => call[0] === 'composer'), false);
  assert.equal(calls.some(call => call[0] === 'presentationComposer'), false);
});

test('manual composer disable still resizes the presentation renderer', () => {
  const container = { clientWidth: 1200, clientHeight: 700 };
  const { system, calls } = makeProfileSystem(container);
  system.applyDisplayProfile(DISPLAY_PROFILES.nineties);
  system.toggleComposer(false);
  calls.length = 0;
  container.clientWidth = 700;
  container.clientHeight = 900;

  system.resize();

  assert.deepEqual(system.renderer.lastSize, { width: 700, height: 525 });
  assert.ok(calls.some(call => call.join(':') === 'renderer:700:525:false'));
  assert.ok(calls.some(call => call.join(':') === 'presentationComposer:700:525'));
  assert.equal(calls.some(call => call.join(':') === 'composer:800:600'), false);
});

test('direct fallback ignores composer and effect re-enable requests', () => {
  const container = { clientWidth: 1200, clientHeight: 700 };
  const { system, calls } = makeProfileSystem(container);
  system.forceDirectRendering(DISPLAY_PROFILES.early2000s);
  system.toggleComposer(true);
  system.useOutlineEffect = false;
  system.toggleOutlineEffect(true);
  system.useCRTEffect = false;
  system.toggleCRTEffect(true);
  calls.length = 0;
  container.clientWidth = 700;
  container.clientHeight = 900;

  system.resize();

  assert.equal(system.isDirectFallback, true);
  assert.equal(system.useComposer, false);
  assert.equal(system.useOutlineEffect, false);
  assert.equal(system.useCRTEffect, false);
  assert.deepEqual(system.renderer.lastSize, { width: 1024, height: 768 });
  assert.equal(system.renderer.domElement.style.width, '700px');
  assert.equal(system.renderer.domElement.style.height, '525px');
  assert.equal(calls.some(call => call[0] === 'renderer'), false);
  assert.equal(calls.some(call => call[0] === 'composer'), false);
  assert.equal(calls.some(call => call[0] === 'presentationComposer'), false);
});

test('frame routing presents the current logical composer texture', () => {
  const system = new RenderSystem({ systems: new Map() });
  const calls = [];
  const logicalDepth = { id: 'logical-depth' };
  system.initialized = true;
  system.activeScene = { camera: {} };
  system.composer = {
    readBuffer: { texture: { id: 'logical-frame' }, depthTexture: logicalDepth },
    render: () => calls.push('logical'),
  };
  system.outlinePass = { uniforms: { tDepth: { value: null } } };
  system.presentationPass = { map: null };
  system.presentationComposer = { render: () => calls.push('presentation') };
  system.renderer = { clear: () => calls.push('clear') };
  system.crtPass = { enabled: true, uniforms: { time: { value: 0 } } };

  system.update(16);

  assert.deepEqual(calls, ['clear', 'logical', 'presentation']);
  assert.equal(system.outlinePass.uniforms.tDepth.value, logicalDepth);
  assert.equal(system.presentationPass.map.id, 'logical-frame');
  assert.equal(system.crtPass.uniforms.time.value, 0.016);
});

test('early-2000s bypasses the presentation compositor and removes its CRT shader', () => {
  const { system } = makeProfileSystem();
  system.outputPass = { isOutputPass: true };
  system.presentationComposer.passes = [system.presentationPass, system.crtPass, system.outputPass];
  system.presentationComposer.addPass = pass => system.presentationComposer.passes.push(pass);
  system.presentationComposer.insertPass = (pass, index) => system.presentationComposer.passes.splice(index, 0, pass);
  system.presentationComposer.removePass = pass => system.presentationComposer.passes.splice(
    system.presentationComposer.passes.indexOf(pass),
    1,
  );

  system.applyDisplayProfile(DISPLAY_PROFILES.early2000s);

  assert.equal(system.useComposer, false);
  assert.deepEqual(system.presentationComposer.passes, [system.presentationPass, system.outputPass]);
  assert.equal(system.crtPass.enabled, false);

  system.toggleCRTEffect(true);
  assert.equal(system.useComposer, false);
  assert.equal(system.crtPass.enabled, false);
  assert.deepEqual(system.presentationComposer.passes, [system.presentationPass, system.outputPass]);

  system.applyDisplayProfile(DISPLAY_PROFILES.eighties);

  assert.equal(system.useComposer, true);
  assert.deepEqual(system.presentationComposer.passes, [system.presentationPass, system.crtPass, system.outputPass]);
  assert.equal(system.crtPass.enabled, true);
});

test('context restoration awaits rebuild, reapplies active profile, then resumes engine', async () => {
  const system = new RenderSystem({ systems: new Map(), isRunning: false });
  const calls = [];
  let finishSetup;
  system.activeDisplayProfile = DISPLAY_PROFILES.nineties;
  system.setupPostprocessing = () => new Promise(resolve => {
    finishSetup = () => {
      system.composer = { id: 'logical-composer' };
      system.presentationComposer = { id: 'presentation-composer' };
      calls.push('setup');
      resolve();
    };
  });
  system.applyDisplayProfile = profile => {
    assert.equal(system.composer.id, 'logical-composer');
    assert.equal(system.presentationComposer.id, 'presentation-composer');
    calls.push(`apply:${profile.id}`);
  };

  const recovery = system._handleContextRestored();
  assert.equal(system.engine.isRunning, false);
  assert.deepEqual(calls, []);
  finishSetup();
  assert.deepEqual(calls, ['setup']);
  await recovery;

  assert.deepEqual(calls, ['setup', 'apply:nineties']);
  assert.equal(system.engine.isRunning, true);
});

test('context restoration preserves direct fallback after a failed compositor rebuild', async () => {
  const system = new RenderSystem({ systems: new Map(), isRunning: false });
  const calls = [];
  system.activeDisplayProfile = DISPLAY_PROFILES.nineties;
  system.setupPostprocessing = async () => {
    system.isDirectFallback = true;
  };
  system.applyDisplayProfile = () => calls.push('apply');

  await system._handleContextRestored();

  assert.deepEqual(calls, []);
  assert.equal(system.engine.isRunning, true);
});

test('direct-render fallback retains exact profile dimensions and CSS sampling', () => {
  const { system, calls } = makeProfileSystem();
  system.applyDisplayProfile(DISPLAY_PROFILES.eighties);

  system.forceDirectRendering(DISPLAY_PROFILES.early2000s);
  system.initialized = true;
  system.activeScene = { camera: {} };
  system.renderer.clear = () => calls.push(['clear']);
  system.renderer.render = () => calls.push(['direct']);
  system.composer.render = () => calls.push(['logical']);
  system.presentationComposer.render = () => calls.push(['presentation']);
  system.crtPass.uniforms.time = { value: 0 };
  calls.length = 0;
  system.update(16);

  assert.equal(system.useComposer, false);
  assert.equal(system.activeDisplayProfile.id, 'early2000s');
  assert.deepEqual(system.renderer.lastSize, { width: 1024, height: 768 });
  assert.equal(system.renderer.domElement.style.width, '932px');
  assert.equal(system.renderer.domElement.style.height, '699px');
  assert.equal(system.renderer.domElement.style.imageRendering, 'auto');
  assert.deepEqual(calls, [['clear'], ['direct']]);
});

test('shutdown disposes both composers and their passes once', () => {
  const system = new RenderSystem({ systems: new Map() });
  const calls = [];
  const disposable = name => ({ dispose: () => calls.push(name) });
  system.presentationComposer = disposable('presentationComposer');
  system.presentationPass = disposable('presentationPass');
  system.crtPass = disposable('crtPass');
  system.outputPass = disposable('outputPass');
  system.composer = disposable('composer');
  system.renderPass = disposable('renderPass');
  system.outlinePass = disposable('outlinePass');

  system.shutdown();
  system.shutdown();

  assert.deepEqual(calls, [
    'presentationComposer',
    'presentationPass',
    'crtPass',
    'outputPass',
    'composer',
    'renderPass',
    'outlinePass',
  ]);
  assert.equal(system.presentationComposer, null);
  assert.equal(system.presentationPass, null);
  assert.equal(system.crtPass, null);
  assert.equal(system.outputPass, null);
  assert.equal(system.composer, null);
  assert.equal(system.renderPass, null);
  assert.equal(system.outlinePass, null);
});

test('post-processing setup failure enters direct rendering at the requested profile size', async () => {
  const { system } = makeProfileSystem();
  const calls = [];
  system.logger = { log() {} };
  system.activeDisplayProfile = DISPLAY_PROFILES.nineties;
  system.presentationComposer = {
    dispose: () => {
      calls.push('presentationComposer');
      throw new Error('GPU target failed');
    },
  };
  system.presentationPass = { dispose: () => calls.push('presentationPass') };
  system.crtPass = { dispose: () => calls.push('crtPass') };
  system.outputPass = { dispose: () => calls.push('outputPass') };
  system.composer = { dispose: () => calls.push('composer') };
  system.renderPass = { dispose: () => calls.push('renderPass') };
  system.outlinePass = { dispose: () => calls.push('outlinePass') };
  const originalError = console.error;
  console.error = () => {};
  try {
    await system.setupPostprocessing();
  } finally {
    console.error = originalError;
  }

  assert.equal(system.useComposer, false);
  assert.equal(system.activeDisplayProfile.id, 'nineties');
  assert.deepEqual(system.renderer.lastSize, { width: 800, height: 600 });
  assert.equal(system.renderer.domElement.style.width, '932px');
  assert.equal(system.renderer.domElement.style.height, '699px');
  assert.deepEqual(calls, [
    'presentationComposer',
    'presentationPass',
    'crtPass',
    'outputPass',
    'composer',
    'renderPass',
    'outlinePass',
  ]);
  assert.equal(system.presentationComposer, null);
  assert.equal(system.presentationPass, null);
  assert.equal(system.crtPass, null);
  assert.equal(system.outputPass, null);
  assert.equal(system.composer, null);
  assert.equal(system.renderPass, null);
  assert.equal(system.outlinePass, null);
});

test('post-processing allocation failure disposes partial resources before direct fallback', async () => {
  const container = { clientWidth: 1200, clientHeight: 700 };
  const system = new RenderSystem({ systems: new Map() });
  const calls = [];
  system.logger = { log() {} };
  system.activeDisplayProfile = DISPLAY_PROFILES.nineties;
  system.renderer = {
    domElement: { style: {}, parentElement: container },
    getPixelRatio: () => 1,
    getSize: target => target.set(932, 699),
    setPixelRatio() {},
    setSize: (width, height) => {
      system.renderer.lastSize = { width, height };
    },
  };

  let composer = null;
  Object.defineProperty(system, 'composer', {
    configurable: true,
    get: () => composer,
    set: value => {
      composer = value;
      if (value) value.dispose = () => calls.push('composer');
    },
  });
  let presentationComposer = null;
  Object.defineProperty(system, 'presentationComposer', {
    configurable: true,
    get: () => presentationComposer,
    set: value => {
      presentationComposer = value;
      if (value) value.dispose = () => calls.push('presentationComposer');
    },
  });
  let renderPass = null;
  Object.defineProperty(system, 'renderPass', {
    configurable: true,
    get: () => renderPass,
    set: value => {
      renderPass = value;
      if (value) value.dispose = () => calls.push('renderPass');
    },
  });
  let outlinePass = null;
  Object.defineProperty(system, 'outlinePass', {
    configurable: true,
    get: () => outlinePass,
    set: value => {
      outlinePass = value;
      if (value) value.dispose = () => calls.push('outlinePass');
    },
  });
  let presentationPass = null;
  Object.defineProperty(system, 'presentationPass', {
    configurable: true,
    get: () => presentationPass,
    set: value => {
      if (value) throw new Error('presentation pass allocation failed');
      presentationPass = value;
    },
  });

  const originalError = console.error;
  console.error = () => {};
  try {
    await system.setupPostprocessing();
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(calls, [
    'presentationComposer',
    'composer',
    'renderPass',
    'outlinePass',
  ]);
  assert.equal(system.presentationComposer, null);
  assert.equal(system.presentationPass, null);
  assert.equal(system.crtPass, null);
  assert.equal(system.composer, null);
  assert.equal(system.renderPass, null);
  assert.equal(system.outlinePass, null);
  assert.equal(system.useComposer, false);
  assert.equal(system.isDirectFallback, true);
  assert.deepEqual(system.renderer.lastSize, { width: 800, height: 600 });
});

test('scene resize keeps the orthographic camera at the fixed world aspect', () => {
  const scene = new Scene();
  scene.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  scene.resize(1920, 1080);

  assert.equal(scene.camera.left, -SCREEN_ASPECT);
  assert.equal(scene.camera.right, SCREEN_ASPECT);
  assert.equal(scene.camera.top, 1);
  assert.equal(scene.camera.bottom, -1);
});

test('canvas textures register mutable raster handles and components release them', () => {
  const originalDocument = globalThis.document;
  const draws = [];
  const context = { canvas: null, clearRect() {}, fillRect() {}, fillText() {} };
  const canvas = { width: 0, height: 0, getContext: () => context };
  context.canvas = canvas;
  globalThis.document = { createElement: name => {
    assert.equal(name, 'canvas');
    return canvas;
  } };
  try {
    const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
    const system = new RenderSystem({ systems: new Map() }, {
      getDisplayProfile: () => DISPLAY_PROFILES.eighties,
      textureRasterizer: rasterizer,
    });
    const texture = system.createCanvasTexture(
      40,
      20,
      () => draws.push('initial'),
      { worldWidth: 1, label: 'Lifecycle test' },
    );
    const handle = texture.userData.rasterHandle;
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(handle.label, 'Lifecycle test');
    assert.deepEqual([canvas.width, canvas.height], [240, 120]);

    const component = new RenderComponent();
    component._renderSystem = system;
    component.updateTexture({ material: { map: texture } }, () => draws.push('replacement'));
    assert.deepEqual(draws, ['initial', 'replacement']);

    component.meshes = [{
      geometry: { dispose() {} },
      material: { map: texture, dispose() {} },
      parent: { remove() {} },
    }];
    component.onRemove();
    assert.equal(texture.userData.rasterHandle, undefined);
    assert.equal(rasterizer.redraw(handle), false);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('direct texture update reapplies early-2000s linear sampling after an eighties texture', () => {
  const originalDocument = globalThis.document;
  const context = { canvas: null, clearRect() {} };
  const canvas = { width: 0, height: 0, getContext: () => context };
  context.canvas = canvas;
  globalThis.document = {
    createElement: name => {
      assert.equal(name, 'canvas');
      return canvas;
    },
  };
  try {
    const { system } = makeProfileSystem();
    system.applyDisplayProfile(DISPLAY_PROFILES.eighties);
    const texture = system.createCanvasTexture(40, 20, () => {});
    assert.equal(texture.minFilter, THREE.NearestFilter);
    assert.equal(texture.magFilter, THREE.NearestFilter);

    system.applyDisplayProfile(DISPLAY_PROFILES.early2000s);
    const component = new RenderComponent();
    component._renderSystem = system;
    component.updateTexture({ material: { map: texture } }, () => {});

    assert.equal(texture.minFilter, THREE.LinearFilter);
    assert.equal(texture.magFilter, THREE.LinearFilter);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('direct card texture sampling stays nearest after the early-2000s profile and repaint', () => {
  const originalDocument = globalThis.document;
  const context = { canvas: null, clearRect() {} };
  const canvas = { width: 0, height: 0, getContext: () => context };
  context.canvas = canvas;
  globalThis.document = { createElement: () => canvas };
  try {
    const { system } = makeProfileSystem();
    system.applyDisplayProfile(DISPLAY_PROFILES.early2000s);
    const texture = system.createCanvasTexture(40, 20, () => {}, { sampling: 'nearest' });
    const component = new RenderComponent();
    component._renderSystem = system;
    component.updateTexture({ material: { map: texture } }, () => {});

    assert.equal(texture.userData.sampling, 'nearest');
    assert.equal(texture.minFilter, THREE.NearestFilter);
    assert.equal(texture.magFilter, THREE.NearestFilter);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('configured rasterization rejects canvas textures without registration metadata', () => {
  const originalDocument = globalThis.document;
  const context = { canvas: null, clearRect() {} };
  const canvas = { width: 0, height: 0, getContext: () => context };
  context.canvas = canvas;
  globalThis.document = { createElement: () => canvas };
  try {
    const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
    const system = new RenderSystem({ systems: new Map() }, {
      getDisplayProfile: () => DISPLAY_PROFILES.eighties,
      textureRasterizer: rasterizer,
    });

    assert.throws(
      () => system.createCanvasTexture(256, 64, () => {}),
      /worldWidth.*label|registration metadata/i,
    );
  } finally {
    globalThis.document = originalDocument;
  }
});

test('button and text display rasterize text at their rendered world widths', () => {
  const originalDocument = globalThis.document;
  const canvases = [];
  globalThis.document = {
    createElement: () => {
      const draws = [];
      const canvas = { width: 0, height: 0, draws, getContext: () => context };
      const context = {
        canvas,
        clearRect() {},
        fillText: (...args) => draws.push(args),
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  try {
    const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
    const system = new RenderSystem({ systems: new Map() }, {
      getDisplayProfile: () => DISPLAY_PROFILES.eighties,
      textureRasterizer: rasterizer,
    });
    const makeOwner = name => ({ name, add() {} });

    const button = new ButtonComponent('PLAY', 0.4, 0.15);
    button._renderSystem = system;
    button.gameObject = makeOwner('PlayButton');
    button.logger = { log() {} };
    button.onRenderSystemReady();
    const buttonTexture = button.meshes[1].material.map;
    assert.equal(buttonTexture.userData.rasterHandle.label, 'ButtonText');
    assert.ok(Math.abs(buttonTexture.userData.rasterHandle.worldWidth - 0.32) < Number.EPSILON);
    assert.deepEqual([buttonTexture.image.width, buttonTexture.image.height], [77, 19]);
    assert.deepEqual(buttonTexture.image.draws.at(-1), ['PLAY', 39, 10]);

    const display = new TextDisplayComponent('READY', '#fff', 32);
    display._renderSystem = system;
    display.gameObject = makeOwner('Message');
    display.logger = { log() {} };
    display.onRenderSystemReady();
    const displayTexture = display.meshes[0].material.map;
    assert.equal(displayTexture.userData.rasterHandle.label, 'TextDisplay');
    assert.equal(displayTexture.userData.rasterHandle.worldWidth, 1);
    assert.deepEqual([displayTexture.image.width, displayTexture.image.height], [240, 60]);
    assert.deepEqual(displayTexture.image.draws.at(-1), ['READY', 120, 30]);

    display.setText('NEXT');
    assert.deepEqual(displayTexture.image.draws.at(-1), ['NEXT', 120, 30]);
    assert.equal(canvases.length, 2);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('ticker rasterizes its full repeating tile at each profile density', () => {
  const originalDocument = globalThis.document;
  const context = {
    canvas: null,
    clearRect() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    fillText() {},
    measureText(text) { return { width: text.length * 10 }; },
  };
  const canvas = { width: 0, height: 0, getContext: () => context };
  context.canvas = canvas;
  globalThis.document = { createElement: () => canvas };

  try {
    const rasterizer = new TextureRasterizer(DISPLAY_PROFILES.eighties);
    const system = new RenderSystem({ systems: new Map() }, {
      getDisplayProfile: () => DISPLAY_PROFILES.eighties,
      textureRasterizer: rasterizer,
    });
    const gameManager = {
      state: 'idle',
      addEventListener() {},
      removeEventListener() {},
    };
    const ticker = new TickerComponent(gameManager);
    ticker._renderSystem = system;
    ticker.gameObject = new THREE.Object3D();
    ticker.onRenderSystemReady();

    const handle = ticker._texture.userData.rasterHandle;
    assert.equal(handle.worldWidth, 6.4);
    for (const [profile, expectedWidth, expectedDensity] of [
      [DISPLAY_PROFILES.eighties, 1536, 240],
      [DISPLAY_PROFILES.nineties, 1920, 300],
      [DISPLAY_PROFILES.early2000s, 2458, 384],
    ]) {
      rasterizer.applyDisplayProfile(profile);
      assert.equal(canvas.width, expectedWidth, profile.id);
      assert.ok(Math.abs(canvas.width / handle.worldWidth - expectedDensity) < 0.1, profile.id);
    }

    ticker.onRemove();
  } finally {
    globalThis.document = originalDocument;
  }
});
