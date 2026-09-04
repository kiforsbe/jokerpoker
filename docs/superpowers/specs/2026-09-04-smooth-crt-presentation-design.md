# Smooth CRT presentation design

## Goal

Render a visibly curved CRT tube for the 1980s and 1990s profiles without turning straight source lines into large nearest-neighbour stair steps. Preserve the native 640x480 and 800x600 game framebuffers and their deliberately hard pixel-art treatment.

## Problem

The current composer renders the CRT warp at the logical framebuffer size and CSS-upscales that warped result with `image-rendering: pixelated`. Each low-resolution warp step is therefore magnified, producing the jagged cabinet edges shown in the reference image. Reducing curvature hides the issue but also removes the intended tube effect.

## Architecture

RenderSystem gains two explicit resolution domains:

1. **Logical compositor** renders the scene and outline effects at `profile.framebuffer` only. Its targets use the profile's scene sampling (`nearest` for 80s/90s, `linear` for early 2000s). No logical pass writes directly to the screen.
2. **Presentation compositor** receives the completed logical texture and renders at the fitted CSS display size, with DPR fixed at 1. It owns final copy/CRT presentation. The CRT warp occurs here, so its curve has one output sample per displayed pixel instead of one per logical source pixel.

The renderer canvas's physical size is the presentation size; CSS dimensions match it. World coordinates, camera aspect, pointer mapping, texture-raster density, animation timing, game state, and the profile's fixed logical framebuffer remain unchanged.

For CRT profiles, the presentation compositor uses the logical texture with nearest source sampling, then applies curvature, scanlines, chroma shift, vignette, flicker, and stable noise at presentation resolution. The shader receives both `sourceResolution` (logical width/height, used for pixel-relative chroma and scanline semantics) and `presentationResolution` (the final output dimensions, used for smooth geometry/noise). The early-2000s profile uses the same logical-to-presentation copy path but keeps CRT disabled and its linear output sampling.

## Lifecycle and failure handling

- `applyDisplayProfile` updates logical targets, source filters, CRT preset, and presentation target size as one renderer application operation.
- Host resize updates only presentation targets and canvas size; the logical targets remain fixed until the profile changes.
- Context restoration rebuilds both composers, reapplies the active profile, then resumes the engine.
- If compositor/presentation creation fails, the existing direct-render fallback continues at the requested logical dimensions and CSS fit. It may omit CRT rather than compromise gameplay.
- Both composers and their render targets are disposed during rebuild/renderer disposal.

## Native pixel-art contract

Low-profile texture rasters remain native coarse/detailed canvases with nearest filters. The existing low-art alpha hardening remains in effect, so the presentation pass never receives partially alpha-antialiased card edges. The presentation warp is permitted to move pixel edges smoothly at display scale; it must not replace the logical source with a high-resolution vector/downscaled version.

## Verification

- Unit tests distinguish logical profile dimensions from presentation dimensions, prove host resize changes presentation only, verify low-profile logical targets use nearest sampling, and verify CRT shader uniforms use source versus presentation resolution correctly.
- Context-recovery and direct-fallback tests cover both compositor stages.
- Browser QA at 1200x900 and 700x900 captures 80s/90s/2000s states. In 80s/90s, cabinet borders visibly curve smoothly without the large staircase artifact; 80s remains stronger than 90s; 2000s remains clean. Pixel-art cards retain crisp low-grid detail.

## Non-goals

No changes to gameplay, sound, animation timing, UI geometry, profile logical resolutions, card-art grids, controller persistence, or input/world-coordinate behavior.
