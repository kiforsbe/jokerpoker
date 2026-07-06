# Joker Poker

A fan-made **tribute** to the classic Finnish **Jokeripokeri** arcade video poker machine (as found in RAY/PAF cabinets), rebuilt for the browser with [Three.js](https://threejs.org/) and the Web Audio API. No build step, no framework — just ES modules served statically.

> **Disclaimer:** This is a non-commercial hobby homage, not an official product. It is not affiliated with, endorsed by, or connected to RAY, PAF, Veikkaus, or any maker of the original machines. **No original audio, graphics, code, or other assets from the original game are used** — every visual is drawn procedurally and every sound is synthesized from scratch; the look and feel are recreated purely from memory and reference photographs. No real-money play: the credits are make-believe.

## Features

- **Full Jokeripokeri game loop** — bet, deal, hold, draw, win meter, collect, and *tuplaus* (double-up) with the authentic red-7-keeps rule
- **Three resolutions** — pixelated 640×480 and 960×720 machine modes (procedural pixel-art court cards, VT323 CRT font) plus a photo-matched hi-res mode; cycle with **F2** or the corner chip
- **Three display languages** — all screen text (status bar, pay table, hold boxes, win overlay, tuplaus ticker) switches between English, Swedish, and Finnish via a corner chip; the cabinet buttons stay trilingual like the original printed panel
- **CRT post-processing** — scanline shader, outline/edge-highlight passes
- **Machine-faithful audio** — procedurally synthesized square/noise waveforms via the Web Audio API: button ticks, shuffle and card-deal sounds, win count-up, tuplaus tunes, and attract-mode music
- **Authentic trilingual cabinet panel** — Swedish / Finnish / English color-coded buttons rendered as a DOM overlay below the CRT
- **Attract mode** with card animations and music
- **Responsive layout** — the 4:3 game screen letterboxes to any window while the button panel adapts, so it plays on phones (portrait or landscape) as well as desktop; touch input supported
- **Data-driven pay table** with win-row highlight
- **Suspense reveal** — when the draw sits one card away from a hand paying more than double the bet (straight or better), replacements turn over in slow motion, each miss stretching the next flip further until the hand resolves
- **Tuplaus staging** — entering double-up clears the table and reshuffles, deals the card center-stage, runs a scrolling rules ticker along the bottom band, and keeps the tuplaus tune playing for the whole run (ducking briefly under sound effects) until you lose or collect

## Getting started

Requires [Node.js](https://nodejs.org/) 18+ (for `npx` and the test runner). Three.js is loaded from a CDN via an import map, so an internet connection is needed at runtime.

```sh
npm start
```

Then open <http://localhost:5500/src/index.html> in your browser.

Any static file server works (VS Code Live Server, `python -m http.server`, …) — a server is required because the game uses ES modules, which don't load over `file://`. A VS Code launch configuration ([.vscode/launch.json](.vscode/launch.json)) is included that opens Chrome against port 5500.

## Controls

Click the cabinet buttons, or use the keyboard. The ⤢ chip in the top-right corner toggles fullscreen (hidden on iPhone Safari, which has no page-fullscreen API — use Add to Home Screen there). Next to it, the ▤ chip (or `F3`) cycles three UI modes: **cabinet** (buttons below the screen), **overlay** (the same buttons translucent over it), and **screen-only** (no buttons — the playfield does everything: tap the deck to deal/draw or start the double after a win, tap cards to hold, the bet oval to change the bet, the Wins box to collect, and the left/right field half to guess LOW/HIGH). The choice is remembered.

| Key | Action |
| --- | --- |
| `Enter` / `Space` | Play — deal or draw |
| `1`–`5` | Hold/unhold card 1–5 |
| `B` | Cycle bet |
| `C` | Collect winnings |
| `D` | Start double-up (tuplaus) |
| `S` / `←` | Guess small (1–6) |
| `L` / `→` | Guess large (8–13) |
| `F2` | Cycle resolution: 640×480 / 960×720 / hi-res |
| `F3` | Cycle UI mode: cabinet / overlay / screen-only |
| `Alt+D` | Debug panel (`Alt+C` CRT, `Alt+O` outline, `Alt+R` composer, `Alt+W` render mode) |

## Running the tests

```sh
npm test
```

Unit tests cover hand evaluation, payouts, tuplaus rules, theming, and the audio director/music player, using the built-in Node.js test runner.

## Deploying to GitHub Pages

Pushing a version tag (`v*`) deploys automatically: the workflow runs the test suite, then publishes the `src/` folder to <https://kiforsbe.github.io/jokerpoker/>.

```sh
git tag v0.3.0
git push origin v0.3.0
```

Plain pushes to `main` never deploy. The workflow can also be run manually from the **Actions** tab → **Deploy to GitHub Pages** → **Run workflow**.

## Project structure

```
src/
  index.html          Entry page (import map for Three.js, loads index.js)
  index.js            Bootstraps engine, systems, and the game scene
  engine/             Minimal game engine: GameEngine, Scene, GameObject, Component, InputSystem
  game/               Game logic: state machine (Game), Deck, Card, HandEvaluator, payouts, Tuplaus
  rendering/          RenderSystem, theme (retro/hires), card/deck/UI render components,
                      animations, particle effects, and CRT/outline shaders
  audio/              AudioSystem, AudioDirector (event-driven SFX/music), RetroSound synth,
                      MusicPlayer
  ui/                 CabinetPanel — trilingual DOM button panel
  utils/              DebugPanel, GameLogger
tests/                Node.js test-runner unit tests
```

### Architecture notes

- The engine is a small component/entity system: `GameObject`s hold `Component`s, grouped in a `Scene`, driven by `GameEngine` and pluggable systems (render, audio, input).
- Game rules live in plain modules ([src/game/](src/game/)) with no rendering or audio dependencies, which is what makes them unit-testable.
- Audio is fully event-driven: game state changes emit events that [AudioDirector.js](src/audio/AudioDirector.js) maps to synthesized sounds and tunes — there are no audio sample files.
- Theming is centralized in [theme.js](src/rendering/theme.js); render components subscribe to theme changes so the whole scene can switch between retro and hi-res live.
