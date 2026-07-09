// Builds the offline variants of the game. Usage: node scripts/build.mjs <local|vendored>
//   local    -> dist/local    single classic-script bundle, runs from file://
//   vendored -> dist/vendored ES modules with three.js vendored, serve with any static server
import { mkdirSync, rmSync, cpSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { transformHtml } from './htmlTransform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (mode !== 'local' && mode !== 'vendored') fail('usage: node scripts/build.mjs <local|vendored>');

const threeDir = path.join(root, 'node_modules', 'three');
if (!existsSync(threeDir)) fail('build: node_modules/three missing - run `npm install` first');
const fontDir = path.join(root, 'assets', 'fonts');
if (!existsSync(path.join(fontDir, 'VT323-Regular.ttf'))) fail('build: assets/fonts/VT323-Regular.ttf missing');
if (mode === 'local' && !existsSync(path.join(root, 'node_modules', 'esbuild'))) {
  fail('build: node_modules/esbuild missing - run `npm install` first');
}

const out = path.join(root, 'dist', mode);
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'fonts'), { recursive: true });

// Throws (and thereby fails the build) if src/index.html drifted from the markers.
const html = transformHtml(readFileSync(path.join(root, 'src', 'index.html'), 'utf8'), mode);

for (const f of ['VT323-Regular.ttf', 'OFL.txt']) {
  copyFileSync(path.join(fontDir, f), path.join(out, 'fonts', f));
}

if (mode === 'local') {
  const esbuild = await import('esbuild');
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'index.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    outfile: path.join(out, 'game.js'),
    logLevel: 'info',
  });
} else {
  // The src tree already contains the vendored es-module-shims.
  const rootIndexHtml = path.join(root, 'src', 'index.html');
  cpSync(path.join(root, 'src'), out, {
    recursive: true,
    filter: (p) => path.resolve(p) !== rootIndexHtml,
  });
  const vendorThree = path.join(out, 'vendor', 'three');
  mkdirSync(path.join(vendorThree, 'examples', 'jsm'), { recursive: true });
  // three.module.js re-exports from its sibling three.core.js (three r18x split).
  for (const f of ['three.module.js', 'three.core.js']) {
    copyFileSync(path.join(threeDir, 'build', f), path.join(vendorThree, f));
  }
  copyFileSync(path.join(threeDir, 'LICENSE'), path.join(vendorThree, 'LICENSE'));
  for (const sub of ['postprocessing', 'shaders']) {
    cpSync(path.join(threeDir, 'examples', 'jsm', sub), path.join(vendorThree, 'examples', 'jsm', sub), { recursive: true });
  }
}

writeFileSync(path.join(out, 'index.html'), html);
console.log(`build: dist/${mode} ready`);
