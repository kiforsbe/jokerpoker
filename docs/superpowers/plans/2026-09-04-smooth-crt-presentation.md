# Smooth CRT Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each game profile at its fixed native framebuffer while applying CRT curvature at the fitted display resolution, eliminating magnified curvature stair-steps.

**Architecture:** `RenderSystem.composer` remains the logical compositor containing the scene and outline passes at 640x480, 800x600, or 1024x768. A new `presentationComposer` copies its completed texture into a fitted DPR-1 target and runs the CRT shader there. The CRT shader distinguishes the logical source dimensions (for scanline and chroma semantics) from presentation dimensions (for output noise and geometry).

**Tech Stack:** JavaScript ES modules, Three.js `EffectComposer`, `TexturePass`, `ShaderPass`, Node.js built-in test runner, in-app browser QA.

**Spec:** `docs/superpowers/specs/2026-09-04-smooth-crt-presentation-design.md`

## Global Constraints

- Keep all three fixed logical framebuffers unchanged: 1980s 640x480, 1990s 800x600, early 2000s 1024x768.
- Keep scene textures nearest-filtered for the 1980s and 1990s, and linear-filtered for early 2000s.
- Render the canvas at the fitted 4:3 display size with pixel ratio 1; use CSS dimensions equal to that physical renderer size.
- Do not change game state, audio, animation timing, world coordinates, profile persistence, UI layout, or card-art grids.
- Direct-render fallback must remain playable at the logical profile size even when either compositor cannot be created.
- Use `apply_patch` for source, test, and documentation edits. Commit each independently testable task.

---

### Task 1: Make CRT shader resolution domains explicit

**Files:**
- Modify: `src/rendering/shaders/CRTShader.js:3-112`
- Modify: `src/rendering/RenderSystem.js:287-344`
- Modify: `tests/renderSystemProfile.test.js:14-23`

**Interfaces:**
- Consumes: `ShaderPass` assigns the pass input texture to the standard `tDiffuse` uniform.
- Produces: `CRTShader.uniforms.sourceResolution` and `CRTShader.uniforms.presentationResolution`, both `THREE.Vector2` values.
- Produces: shader semantics in which `sourceResolution` controls pixel-relative RGB shift and scanline count; `presentationResolution` controls smooth noise frequency.

- [ ] **Step 1: Write the failing shader-contract test**

  Replace the first test assertions with:

  ```js
  test('CRT shader separates native source dimensions from final presentation dimensions', () => {
    assert.ok(CRTShader.uniforms.sourceResolution);
    assert.ok(CRTShader.uniforms.presentationResolution);
    assert.equal(CRTShader.uniforms.resolution, undefined);
    assert.match(CRTShader.fragmentShader, /sourceResolution\.y\s*\*\s*scanlineDensity/);
    assert.match(CRTShader.fragmentShader, /rgbShiftPixels\s*\/\s*max\(sourceResolution\.x/);
    assert.match(CRTShader.fragmentShader, /smoothNoise\(uv\s*\*\s*presentationResolution/);
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `node --test tests/renderSystemProfile.test.js --test-name-pattern "CRT shader separates"`

  Expected: FAIL because `sourceResolution` and `presentationResolution` do not yet exist.

- [ ] **Step 3: Replace the overloaded shader uniform**

  In `CRTShader.uniforms`, replace `resolution` with:

  ```js
  sourceResolution: { value: new THREE.Vector2() },
  presentationResolution: { value: new THREE.Vector2() },
  ```

  In the fragment declarations and expressions, replace:

  ```glsl
  uniform vec2 resolution;
  float scanlineCount = resolution.y * scanlineDensity;
  rgbShiftPixels / max(resolution.x, 1.0)
  smoothNoise(uv * resolution * 0.08 + vec2(time * 0.5, 0.0))
  ```

  with:

  ```glsl
  uniform vec2 sourceResolution;
  uniform vec2 presentationResolution;
  float scanlineCount = sourceResolution.y * scanlineDensity;
  rgbShiftPixels / max(sourceResolution.x, 1.0)
  smoothNoise(uv * presentationResolution * 0.08 + vec2(time * 0.5, 0.0))
  ```

  Update the existing CRT-pass construction and preset application so both
  uniforms are initialized to the current logical framebuffer during this
  compatibility step:

  ```js
  this.crtPass.uniforms.sourceResolution.value.set(size.width, size.height);
  this.crtPass.uniforms.presentationResolution.value.set(size.width, size.height);
  // In _applyCRTPreset:
  uniforms.sourceResolution?.value.set(width, height);
  uniforms.presentationResolution?.value.set(width, height);
  ```

  Keep both values equal in Task 1. Task 2 deliberately supplies the fitted
  presentation dimensions only after it creates the presentation compositor.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `node --test tests/renderSystemProfile.test.js --test-name-pattern "CRT shader separates"`

  Expected: PASS.

- [ ] **Step 5: Commit the shader contract**

  ```powershell
  git add src/rendering/shaders/CRTShader.js tests/renderSystemProfile.test.js
  git commit -m "refactor: separate CRT source and presentation resolution"
  ```

### Task 2: Build logical and presentation composers independently

**Files:**
- Modify: `src/rendering/RenderSystem.js:1-392`
- Modify: `tests/renderSystemProfile.test.js:25-121`

**Interfaces:**
- Consumes: `TexturePass` from `three/addons/postprocessing/TexturePass.js` and the logical compositor's `readBuffer.texture`.
- Produces: `RenderSystem.presentationComposer` and `RenderSystem.presentationPass`.
- Produces: `_logicalRenderSize()` returning `activeDisplayProfile.framebuffer`; `_presentationRenderSize()` returning `_fitScreenSize()`.
- Produces: `_applyCRTPreset(preset, sourceSize, presentationSize)` setting both CRT resolution uniforms.

- [ ] **Step 1: Write failing dual-compositor profile tests**

  Extend `makeProfileSystem` to provide a fake `presentationComposer`, `presentationPass`, and CRT uniforms named `sourceResolution` and `presentationResolution`. Replace the profile application expectations with:

  ```js
  system.applyDisplayProfile(DISPLAY_PROFILES.nineties);

  assert.deepEqual(system.renderer.lastSize, { width: 932, height: 699 });
  assert.ok(calls.some(call => call.join(':') === 'composer:800:600'));
  assert.ok(calls.some(call => call.join(':') === 'presentationComposer:932:699'));
  assert.ok(calls.some(call => call.join(':') === 'outline:800:600'));
  assert.ok(calls.some(call => call.join(':') === 'crtSourceResolution:800:600'));
  assert.ok(calls.some(call => call.join(':') === 'crtPresentationResolution:932:699'));
  assert.equal(system.composer.renderTarget1.texture.minFilter, THREE.NearestFilter);
  ```

  Add a resize test that changes the host to 700x900 and requires only the presentation side to change:

  ```js
  container.clientWidth = 700;
  container.clientHeight = 900;
  system.resize();

  assert.deepEqual(system.renderer.lastSize, { width: 700, height: 525 });
  assert.ok(calls.some(call => call.join(':') === 'presentationComposer:700:525'));
  assert.equal(calls.some(call => call.join(':') === 'composer:1024:768'), false);
  ```

- [ ] **Step 2: Run the focused profile tests to verify they fail**

  Run: `node --test tests/renderSystemProfile.test.js --test-name-pattern "applies exact|host resize"`

  Expected: FAIL because the renderer and only composer are still logical-size.

- [ ] **Step 3: Add the presentation-composer resources and helpers**

  Add the import:

  ```js
  import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
  ```

  Add constructor fields:

  ```js
  this.presentationComposer = null;
  this.presentationPass = null;
  ```

  Keep `this.composer` as the logical composer. Add helpers:

  ```js
  _logicalRenderSize() {
    return this._renderSize();
  }

  _presentationRenderSize() {
    return this._fitScreenSize();
  }
  ```

  In `init`, size the renderer with `_presentationRenderSize()` and apply the same dimensions to CSS. In `setupPostprocessing`, create the existing scene/outline `composer` at `_logicalRenderSize()` and do not add `crtPass` to it. Create `presentationComposer` at `_presentationRenderSize()`, add a `TexturePass(null)` as `presentationPass`, then add `crtPass` after it. Set the logical composer to `renderToScreen = false`. In `setActiveScene`, rebuild only the logical pass order as `renderPass`, `outlinePass`; never add `crtPass` there.

  Give the logical targets the profile scene filter. The `TexturePass` must receive that logical texture on every frame, not a canvas or newly rasterized high-resolution asset.

- [ ] **Step 4: Wire profile application and CRT uniforms to both domains**

  Change `_applyCRTPreset` to accept `{ width, height }` objects for `sourceSize` and `presentationSize`, then set:

  ```js
  uniforms.sourceResolution?.value.set(sourceSize.width, sourceSize.height);
  uniforms.presentationResolution?.value.set(presentationSize.width, presentationSize.height);
  ```

  In `applyDisplayProfile`, update the renderer and `presentationComposer` with `_presentationRenderSize()`, update the logical composer and outline with the profile framebuffer, retain the scene-filter loop for logical targets only, and call `_applyCRTPreset(profile.postProcessing.crt, logicalSize, presentationSize)`.

  In `resize`, update renderer physical dimensions, canvas CSS dimensions, `presentationComposer.setPixelRatio(1)`, and `presentationComposer.setSize(width, height)` only. Do not resize the logical composer or scene.

- [ ] **Step 5: Run the focused tests to verify they pass**

  Run: `node --test tests/renderSystemProfile.test.js --test-name-pattern "applies exact|host resize|all display profiles"`

  Expected: PASS; the renderer/presentation target follows the host while the logical target follows the profile.

- [ ] **Step 6: Commit the dual compositing setup**

  ```powershell
  git add src/rendering/RenderSystem.js tests/renderSystemProfile.test.js
  git commit -m "feat: add display-resolution CRT presentation pass"
  ```

### Task 3: Route frames, recovery, fallback, and disposal through the new boundary

**Files:**
- Modify: `src/rendering/RenderSystem.js:75-737`
- Modify: `tests/renderSystemProfile.test.js:123-206`

**Interfaces:**
- Consumes: `this.composer.readBuffer.texture` after the logical composer renders.
- Produces: `update(deltaTime)` that renders logical content off-screen, assigns it to `presentationPass.map`, and renders the presentation composer to screen.
- Produces: resilient disposal/recovery behavior covering both composers.

- [ ] **Step 1: Write failing lifecycle tests**

  Add a test for frame routing with spies:

  ```js
  system.initialized = true;
  system.activeScene = { camera: {} };
  system.composer = { readBuffer: { texture: { id: 'logical-frame' } }, render: () => calls.push('logical') };
  system.presentationPass = { map: null };
  system.presentationComposer = { render: () => calls.push('presentation') };
  system.renderer = { clear: () => calls.push('clear') };
  system.crtPass = { enabled: true, uniforms: { time: { value: 0 } } };

  system.update(16);

  assert.deepEqual(calls, ['clear', 'logical', 'presentation']);
  assert.equal(system.presentationPass.map.id, 'logical-frame');
  ```

  Extend recovery setup spies so `setupPostprocessing` creates both composer references, then assert the active profile is reapplied only after that promise resolves. Extend the fallback assertion to require renderer dimensions equal to the logical framebuffer and `presentationComposer` to be unused.

- [ ] **Step 2: Run the focused lifecycle tests to verify they fail**

  Run: `node --test tests/renderSystemProfile.test.js --test-name-pattern "frame routing|context restoration|direct-render fallback"`

  Expected: FAIL because `update` renders only `composer` and never supplies a texture to a presentation pass.

- [ ] **Step 3: Implement the one-way render flow**

  In `update`, preserve the existing time increment and clear. Replace the composer branch with:

  ```js
  if (this.useComposer && this.composer && this.presentationComposer && this.presentationPass) {
    this.composer.render(deltaTime);
    this.presentationPass.map = this.composer.readBuffer.texture;
    this.presentationComposer.render(deltaTime);
  } else {
    this.renderer.render(this.activeScene, this.activeScene.camera);
  }
  ```

  Remove manual `renderToScreen` switching from the logical passes. `EffectComposer` selects the last enabled presentation pass: CRT for CRT profiles, and the texture copy for early 2000s.

- [ ] **Step 4: Implement complete cleanup and compatible fallback**

  Add a private cleanup routine used by `setupPostprocessing` and `shutdown`. Call `presentationComposer.dispose()` (which releases its two render targets), then dispose `presentationPass` and `crtPass`; call `composer.dispose()` (which releases its two logical targets), then dispose `renderPass` and `outlinePass`. Null every reference after disposal so no resource is disposed a second time.

  Keep `forceDirectRendering(profile)` as a no-composer path: set renderer physical dimensions to `profile.framebuffer`, set CSS fit dimensions, set `useComposer = false`, and leave `presentationComposer` unused. Context restoration must rebuild both composers through `setupPostprocessing`, reapply the active profile, and only then set `engine.isRunning = true`.

  In `toggleOutlineEffect` and `toggleCRTEffect`, retain only the enabled-state changes; remove all manual `renderToScreen` assignments. The final enabled pass is selected by `presentationComposer.render()`.

- [ ] **Step 5: Run the focused lifecycle tests to verify they pass**

  Run: `node --test tests/renderSystemProfile.test.js --test-name-pattern "frame routing|context restoration|direct-render fallback|post-processing setup failure"`

  Expected: PASS.

- [ ] **Step 6: Commit lifecycle routing**

  ```powershell
  git add src/rendering/RenderSystem.js tests/renderSystemProfile.test.js
  git commit -m "fix: route CRT through smooth presentation stage"
  ```

### Task 4: Verify the complete display behavior

**Files:**
- Modify: `tests/renderSystemProfile.test.js` only if an assertion discovered during the focused test runs is missing coverage.
- Verify: `src/index.html` in the in-app browser at the local server URL.

**Interfaces:**
- Consumes: the completed logical and presentation compositor implementation.
- Produces: automated evidence that all profiles, texture rasterization, and existing gameplay rendering contracts still pass; visual evidence that curved CRT borders no longer form broad step blocks.

- [ ] **Step 1: Run the display/profile test file**

  Run: `node --test tests/renderSystemProfile.test.js`

  Expected: PASS, including shader contract, profile application, resize isolation, recovery, fallback, and canvas texture tests.

- [ ] **Step 2: Run the complete test suite and static diff check**

  Run:

  ```powershell
  npm test
  git diff --check HEAD~3..HEAD
  ```

  Expected: all tests pass and the diff check emits no whitespace errors.

- [ ] **Step 3: Perform browser QA at both host sizes**

  Start the local static server, open `src/index.html`, enter the game, and select each era with F2. Test at 1200x900 and 700x900:

  ```text
  1980s: visibly strongest smooth curved screen edge, crisp coarse source pixels, CRT scanlines.
  1990s: gentler smooth curved screen edge, detailed source pixels, lighter CRT treatment.
  Early 2000s: clean, uncurved image with its 1024x768 logical source.
  ```

  Reject the change if a straight blue or white cabinet border bends as broad horizontal/vertical rectangular steps like the supplied failure image.

- [ ] **Step 4: Commit any test-only correction found during verification**

  ```powershell
  git add tests/renderSystemProfile.test.js
  git commit -m "test: cover smooth CRT presentation regression"
  ```

  Skip this commit when verification needs no test correction; do not create an empty commit.
