# Joker Poker

A browser remake of the classic Finnish **Jokeripokeri** arcade video poker machine (as found in RAY/PAF cabinets), built with [Three.js](https://threejs.org/) and the Web Audio API. No build step, no framework — just ES modules served statically.

## Features

- **Full Jokeripokeri game loop** — bet, deal, hold, draw, win meter, collect, and *tuplaus* (double-up) with the authentic red-7-keeps rule
- **Two display themes** — photo-matched hi-res mode and a retro mode with a unified 640×480 virtual pixel grid, procedural pixel-art court cards, and the VT323 CRT font (toggle with **F2**)
- **CRT post-processing** — scanline shader, outline/edge-highlight passes
- **Machine-faithful audio** — procedurally synthesized square/noise waveforms via the Web Audio API: button ticks, shuffle and card-deal sounds, win count-up, tuplaus tunes, and attract-mode music
- **Authentic trilingual cabinet panel** — Swedish / Finnish / English color-coded buttons rendered as a DOM overlay below the CRT
- **Attract mode** with card animations and music
- **Data-driven pay table** with win-row highlight

## Getting started

Requires [Node.js](https://nodejs.org/) 18+ (for `npx` and the test runner). Three.js is loaded from a CDN via an import map, so an internet connection is needed at runtime.

```sh
npm start
```

Then open <http://localhost:5500/src/index.html> in your browser.

Any static file server works (VS Code Live Server, `python -m http.server`, …) — a server is required because the game uses ES modules, which don't load over `file://`. A VS Code launch configuration ([.vscode/launch.json](.vscode/launch.json)) is included that opens Chrome against port 5500.

## Controls

Click the cabinet buttons, or use the keyboard:

| Key | Action |
| --- | --- |
| `Enter` / `Space` | Play — deal or draw |
| `1`–`5` | Hold/unhold card 1–5 |
| `B` | Cycle bet |
| `C` | Collect winnings |
| `D` | Start double-up (tuplaus) |
| `S` / `←` | Guess small (1–6) |
| `L` / `→` | Guess large (8–13) |
| `F2` | Toggle retro/hi-res theme |
| `Alt+D` | Debug panel (`Alt+C` CRT, `Alt+O` outline, `Alt+R` composer, `Alt+W` render mode) |

## Running the tests

```sh
npm test
```

Unit tests cover hand evaluation, payouts, tuplaus rules, theming, and the audio director/music player, using the built-in Node.js test runner.

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
