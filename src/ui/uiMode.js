// UI chrome mode for the cabinet button panel. Pure module (no top-level
// DOM access) so `node --test` can import it.
//
//  - cabinet: button panel below the screen (the classic layout)
//  - overlay: same panel floating semi-transparent over the screen bottom
//  - screen:  no buttons at all; everything is done by clicking the
//             playfield (deck deals/doubles, cards hold, bet oval cycles,
//             Wins box collects, left/right field halves guess LOW/HIGH)
export const UI_MODES = ['cabinet', 'overlay', 'screen'];

const STORAGE_KEY = 'jokerpoker.uiMode';

let active = loadStored() ?? 'cabinet';
const listeners = new Set();

function loadStored() {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return UI_MODES.includes(v) ? v : null;
  } catch { return null; }
}

function store(mode) {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, mode); } catch { /* private mode etc. */ }
}

export function getUiMode() { return active; }

export function setUiMode(mode) {
  if (!UI_MODES.includes(mode) || mode === active) return active;
  active = mode;
  store(mode);
  for (const cb of listeners) cb(active);
  return active;
}

export function cycleUiMode() {
  return setUiMode(UI_MODES[(UI_MODES.indexOf(active) + 1) % UI_MODES.length]);
}

export function onUiModeChanged(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
