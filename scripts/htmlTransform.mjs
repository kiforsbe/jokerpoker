// HTML transforms for the offline builds (dist/local and dist/vendored).
// Pure string-in/string-out so tests cover every path without touching
// the filesystem. Markers are exact strings from src/index.html: if an
// edit there breaks one, the build throws instead of shipping a silently
// broken dist.

function mustReplace(html, marker, replacement, what) {
  if (!html.includes(marker)) {
    throw new Error(`build: marker not found in src/index.html (${what}): ${marker}`);
  }
  return html.replace(marker, replacement);
}

const GOOGLE_FONT_TAGS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet">',
];

const STYLE_OPEN = '<style>';
const FONT_FACE = [
  STYLE_OPEN,
  "        @font-face { font-family: 'VT323'; src: url('fonts/VT323-Regular.ttf') format('truetype'); font-display: swap; }",
].join('\n');

const SHIM_TAG = '<script async src="vendor/es-module-shims/es-module-shims.js"></script>';
const MODULE_SCRIPT_TAG = '<script type="module" src="index.js"></script>';
const IMPORTMAP_OPEN = '<script type="importmap">';
const THREE_CORE_URL = /https:\/\/unpkg\.com\/three@[\d.]+\/build\/three\.module\.js/;
const THREE_ADDONS_URL = /https:\/\/unpkg\.com\/three@[\d.]+\/examples\/jsm\//;

function removeImportMap(html) {
  const start = html.indexOf(IMPORTMAP_OPEN);
  if (start === -1) {
    throw new Error('build: marker not found in src/index.html (import map): ' + IMPORTMAP_OPEN);
  }
  const close = '</script>';
  const end = html.indexOf(close, start);
  return html.slice(0, start) + html.slice(end + close.length);
}

function rewriteImportMap(html) {
  if (!THREE_CORE_URL.test(html) || !THREE_ADDONS_URL.test(html)) {
    throw new Error('build: marker not found in src/index.html (three import map URLs)');
  }
  return html
    .replace(THREE_CORE_URL, './vendor/three/three.module.js')
    .replace(THREE_ADDONS_URL, './vendor/three/examples/jsm/');
}

export function transformHtml(html, mode) {
  if (mode !== 'local' && mode !== 'vendored') {
    throw new Error(`build: unknown mode "${mode}" (expected local or vendored)`);
  }

  // Both modes: the committed font replaces Google Fonts.
  for (const tag of GOOGLE_FONT_TAGS) {
    html = mustReplace(html, tag, '', 'Google Fonts tag');
  }
  html = mustReplace(html, STYLE_OPEN, FONT_FACE, 'head style block');

  if (mode === 'local') {
    // A classic-script bundle has no modules: drop the shim and the map.
    html = mustReplace(html, SHIM_TAG, '', 'es-module-shims tag');
    html = removeImportMap(html);
    html = mustReplace(html, MODULE_SCRIPT_TAG, '<script src="game.js"></script>', 'module script tag');
  } else {
    html = rewriteImportMap(html);
  }
  return html;
}
