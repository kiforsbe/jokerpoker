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
