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

test('CRT shader separates native source dimensions from final presentation dimensions', () => {
  assert.ok(CRTShader.uniforms.sourceResolution);
  assert.ok(CRTShader.uniforms.presentationResolution);
  assert.equal(CRTShader.uniforms.resolution, undefined);
  assert.match(CRTShader.fragmentShader, /sourceResolution\.y\s*\*\s*scanlineDensity/);
  assert.match(CRTShader.fragmentShader, /rgbShiftPixels\s*\/\s*max\(sourceResolution\.x/);
  assert.match(CRTShader.fragmentShader, /smoothNoise\(uv\s*\*\s*presentationResolution/);
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
      curvature: { value: { set: (x, y) => calls.push(['curvature', x, y]) } },
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
  assert.equal(system.crtPass.uniforms.scanlineDensity.value, 0.6);
  assert.equal(system.crtPass.uniforms.scanlineIntensity.value, 0.08);
  assert.equal(system.crtPass.uniforms.rgbShiftPixels.value, 0.6);
  assert.ok(calls.some(call => call.join(':') === 'curvature:24:24'));
});

test('CRT presets set every generic uniform and fully reset disabled early-2000s output', () => {
  const { system, calls } = makeProfileSystem();

  system.applyDisplayProfile(DISPLAY_PROFILES.eighties);
  assert.equal(system.crtPass.enabled, true);
  assert.ok(calls.some(call => call.join(':') === 'crtSourceResolution:640:480'));
  assert.ok(calls.some(call => call.join(':') === 'crtPresentationResolution:932:699'));
  assert.equal(system.crtPass.uniforms.scanlineDensity.value, 0.5);
  assert.equal(system.crtPass.uniforms.scanlineIntensity.value, 0.16);
  assert.equal(system.crtPass.uniforms.rgbShiftPixels.value, 1.5);
  assert.equal(system.crtPass.uniforms.noise.value, 0.025);
  assert.equal(system.crtPass.uniforms.flicker.value, 0.012);
  assert.equal(system.crtPass.uniforms.vignetteIntensity.value, 0.18);

  system.applyDisplayProfile(DISPLAY_PROFILES.early2000s);
  assert.equal(system.crtPass.enabled, false);
  for (const uniform of ['scanlineDensity', 'scanlineIntensity', 'rgbShiftPixels', 'noise', 'flicker', 'vignetteIntensity']) {
    assert.equal(system.crtPass.uniforms[uniform].value, 0, uniform);
  }
  assert.ok(calls.some(call => call.join(':') === 'curvature:1000:1000'));
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

test('context restoration awaits rebuild, reapplies active profile, then resumes engine', async () => {
  const system = new RenderSystem({ systems: new Map(), isRunning: false });
  const calls = [];
  let finishSetup;
  system.activeDisplayProfile = DISPLAY_PROFILES.nineties;
  system.setupPostprocessing = () => new Promise(resolve => {
    finishSetup = () => {
      calls.push('setup');
      resolve();
    };
  });
  system.applyDisplayProfile = profile => calls.push(`apply:${profile.id}`);

  const recovery = system._handleContextRestored();
  assert.equal(system.engine.isRunning, false);
  assert.deepEqual(calls, []);
  finishSetup();
  await recovery;

  assert.deepEqual(calls, ['setup', 'apply:nineties']);
  assert.equal(system.engine.isRunning, true);
});

test('direct-render fallback retains exact profile dimensions and CSS sampling', () => {
  const { system } = makeProfileSystem();
  system.applyDisplayProfile(DISPLAY_PROFILES.eighties);

  system.forceDirectRendering(DISPLAY_PROFILES.early2000s);

  assert.equal(system.useComposer, false);
  assert.equal(system.activeDisplayProfile.id, 'early2000s');
  assert.deepEqual(system.renderer.lastSize, { width: 1024, height: 768 });
  assert.equal(system.renderer.domElement.style.width, '932px');
  assert.equal(system.renderer.domElement.style.height, '699px');
  assert.equal(system.renderer.domElement.style.imageRendering, 'auto');
});

test('post-processing setup failure enters direct rendering at the requested profile size', async () => {
  const { system } = makeProfileSystem();
  system.logger = { log() {} };
  system.activeDisplayProfile = DISPLAY_PROFILES.nineties;
  system.composer.renderTarget1.dispose = () => { throw new Error('GPU target failed'); };
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
