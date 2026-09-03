import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvasProducerFiles = [
  'BackgroundRenderComponent.js',
  'CardRenderComponent.js',
  'DeckRenderComponent.js',
  'GambleHints.js',
  'PayTable.js',
  'TickerComponent.js',
  'UIComponent.js',
  'WinDisplayComponent.js',
];

const readRendererSource = file => readFileSync(
  new URL(`../src/rendering/${file}`, import.meta.url),
  'utf8',
);

function callArguments(source, functionName) {
  const calls = [];
  const needle = `${functionName}(`;
  let searchFrom = 0;
  while (true) {
    const start = source.indexOf(needle, searchFrom);
    if (start < 0) return calls;
    const bodyStart = start + needle.length;
    let depth = 1;
    let quote = null;
    let escaped = false;
    let cursor = bodyStart;
    for (; cursor < source.length && depth > 0; cursor++) {
      const character = source[cursor];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
      } else if (character === "'" || character === '"' || character === '`') {
        quote = character;
      } else if (character === '(') {
        depth++;
      } else if (character === ')') {
        depth--;
      }
    }
    assert.equal(depth, 0, `${functionName}: unterminated call`);
    calls.push(source.slice(bodyStart, cursor - 1));
    searchFrom = cursor;
  }
}

test('canvas renderers do not subscribe to the legacy theme module', () => {
  for (const file of canvasProducerFiles) {
    const source = readRendererSource(file);
    assert.ok(!source.includes("from './theme.js'"), `${file}: legacy theme import`);
    assert.ok(!source.includes('onThemeChanged'), `${file}: legacy theme listener`);
    assert.ok(!source.includes('paintThemed'), `${file}: legacy themed paint`);
  }
});

test('neutral renderer layers contain no era IDs', () => {
  for (const file of ['RenderSystem.js', 'RenderComponent.js', 'TextureRasterizer.js']) {
    const source = readRendererSource(file);
    for (const id of ['eighties', 'nineties', 'early2000s']) {
      assert.ok(!source.includes(id), `${file}: ${id}`);
    }
  }
});

test('canvas producers use the registered factory instead of direct CanvasTexture construction', () => {
  for (const file of canvasProducerFiles) {
    const source = readRendererSource(file);
    assert.doesNotMatch(source, /new\s+(?:THREE\.)?CanvasTexture\s*\(/, file);
  }

  for (const file of [...canvasProducerFiles, 'RenderComponent.js']) {
    const source = readRendererSource(file);
    for (const args of callArguments(source, 'createCanvasTexture')) {
      assert.match(args, /\bworldWidth\s*:/, `${file}: worldWidth per factory call`);
      assert.match(args, /\blabel\s*:/, `${file}: label per factory call`);
    }
  }
});
