// Visual theme for the whole game. Two modes:
//  - retro: textures drawn at ~1/3 resolution and blitted up unsmoothed
//    (chunky CRT pixels), VT323 terminal font, procedural pixel-art courts.
//  - hires: full-resolution textures, current font stacks, vector court panels.
// Pure module: no three.js / no top-level DOM so `node --test` can import it.

// The game screen is a fixed 4:3 "CRT" (640x480 heritage): x in
// [-SCREEN_ASPECT, SCREEN_ASPECT], y in [-1, 1] world units. The canvas is
// letterboxed to this ratio whatever the window shape, so layout constants
// below never depend on the window.
export const SCREEN_ASPECT = 4 / 3;

export const PALETTE = {
  field: '#2050c8',        // playfield blue (reference photos)
  surround: '#0a0a12',     // dark bezel outside the 4:3 screen
  frame: '#e8e8e4',        // gray bands across the top and bottom
  statusBg: '#2050c8',     // status boxes keep the playfield blue on the gray band
  statusBorder: '#ffffff',
  statusText: '#ffffff',
  betLabelText: '#1a1a1a', // "Bet" sits directly on the gray band, in black
  betOval: '#ffee33',
  betText: '#1a1a1a',
  payText: '#ffffff',
  payHighlight: '#cc0000',
  holdBg: '#7cd8e6',       // cyan "hold" indicator on the bottom band
  holdBorder: '#2050c8',
  holdText: '#2050c8',
};

// World-space layout (orthographic y in [-1, 1]) shared by the background
// bands and the components that sit on them.
export const LAYOUT = {
  topBandBottomY: 0.76,  // top gray band: screen top down to just below the status row
  // Bottom gray band: runs from here to the screen bottom. The DOM cabinet
  // panel sits below the canvas (not over it), so the whole band is visible;
  // the hold indicators sit inside it. Card bottoms rest one hold-box
  // height (~0.09) above the band top (hand row y in Game._handSlot).
  bottomBandTopY: -0.62, // bottom gray band: screen bottom up to just above the hold indicators
  holdY: -0.685,         // center of the per-card "hold" indicators, inside the band
};

const THEMES = {
  retro: {
    name: 'retro',
    retro: true,
    scale: 1 / 3, // fallback for paintThemed calls without a world width
    // Virtual 640x480 machine screen: the 4:3 world area is 8/3 x 2 world
    // units, so 640 / (8/3) = 240 pixels per unit. Every texture that
    // passes its world width to paintThemed shares this one pixel grid.
    pixelsPerUnit: 240,
    pixelCourts: true,
    // VT323's glyphs fill ~22% less of the em square than bold monospace
    // (cap ascent 0.59em vs 0.72em), so equal px sizes render visibly
    // smaller; scale requests by 1.35 to compensate. The result is then
    // snapped to a multiple of 16px: VT323 is designed on a 16-per-em
    // pixel grid, so only those sizes rasterize with integer design
    // pixels — anything in between draws alternating thick/thin strokes.
    // The 16px floor keeps the smallest requests readable.
    uiFont: (px) => `${Math.max(16, Math.round(px * 1.35 / 16) * 16)}px "VT323", monospace`,
    cardFont: (px) => `${px}px "VT323", Arial, sans-serif`,
  },
  hires: {
    name: 'hires',
    retro: false,
    scale: 1,
    pixelCourts: false,
    uiFont: (px) => `bold ${px}px monospace`,
    cardFont: (px) => `bold ${px}px Arial, sans-serif`,
  },
};

let active = THEMES.retro;
const listeners = new Set();

export function getTheme() { return active; }

export function setTheme(name) {
  const next = THEMES[name];
  if (!next || next === active) return active;
  active = next;
  for (const cb of listeners) cb(active);
  return active;
}

export function toggleTheme() {
  return setTheme(active.retro ? 'hires' : 'retro');
}

export function onThemeChanged(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Texture sampling filter for the active theme, as a three.js filter
// constant (numeric so this module stays importable without three.js):
// retro uses NearestFilter (1003) so baked pixel blocks stay hard on
// screen; hires uses LinearFilter (1006) for smooth sampling.
export function textureFilter() {
  return active.retro ? 1003 : 1006;
}

// Fill text visually centered on (x, cy). textBaseline 'middle' alone is
// not enough: fonts place glyphs asymmetrically around the middle anchor
// (bold monospace centers ~0.11em above it, VT323 ~0.02em below), so a
// fixed anchor tuned for one font sits visibly off with the other.
// The correction is measured from fixed reference glyphs rather than the
// string itself, so every string set in the same font shares one baseline —
// per-string ink bounds would make lines with and without descenders wobble
// against each other (visible as ragged pay table rows). The default 'Hg'
// reference centers the full ascender-to-descender band (right for multi-
// line text); pass 'H' for caps/digits-only strings such as the status
// boxes, whose unused descender room would otherwise push them above
// center. Uses the ctx's current font/fillStyle; honors textAlign.
export function fillTextCentered(ctx, text, x, cy, ref = 'Hg') {
  ctx.textBaseline = 'middle';
  const m = ctx.measureText(ref);
  // Integer anchors: a fractional start position shifts the glyph
  // rasterization off the pixel grid, which reads as randomly fat/thin
  // strokes at retro machine resolution.
  ctx.fillText(text, Math.round(x), Math.round(cy - (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2));
}

// Run a drawing callback under the active theme. The callback must size
// everything from ctx.canvas.width/height. In retro mode the texture
// canvas itself is resized to machine resolution (from the shared 640x480
// grid via worldWidth * pixelsPerUnit) and drawn at 1:1 — the GPU's
// NearestFilter then does the one and only upscale to screen. A CPU
// pre-blit onto a full-size canvas would add a second non-integer nearest
// resample, and stacking two of them (with per-texture factors) is what
// makes identical text render differently between elements.
export function paintThemed(ctx, draw, worldWidth) {
  const canvas = ctx.canvas;
  // Remember the canvas's native (hires) size before any retro resize.
  if (canvas._hiresWidth === undefined) {
    canvas._hiresWidth = canvas.width;
    canvas._hiresHeight = canvas.height;
  }
  let tw = canvas._hiresWidth, th = canvas._hiresHeight;
  if (active.retro) {
    tw = Math.max(1, Math.round(
      worldWidth ? worldWidth * active.pixelsPerUnit : canvas._hiresWidth * active.scale));
    th = Math.max(1, Math.round(tw * canvas._hiresHeight / canvas._hiresWidth));
  }
  if (canvas.width !== tw || canvas.height !== th) {
    // Resizing implicitly clears the canvas (and resets ctx state).
    canvas.width = tw;
    canvas.height = th;
  } else {
    ctx.clearRect(0, 0, tw, th);
  }
  draw(ctx);
  // No alpha thresholding: canvas 2D antialiases glyph edges, and those
  // machine-resolution edge pixels are the SAME antialiasing that text on
  // opaque fills (e.g. the status boxes) bakes into its RGB. Transparent-
  // background textures reach the identical look through GPU blending —
  // each semi-transparent machine pixel magnifies (NearestFilter) into a
  // uniform translucent block over the field. Snapping alpha here would
  // strip that from transparent textures only, making them render harder
  // than their opaque siblings.
}
