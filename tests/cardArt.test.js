import { test } from 'node:test';
import assert from 'node:assert/strict';
import CardRenderComponent from '../src/rendering/CardRenderComponent.js';
import {
  ART_RASTERS,
  cardBackDetail,
  drawCourtArt,
  drawJokerArt,
  getArtRaster,
} from '../src/rendering/cardArt/cardArt.js';
import { drawCourtSprite } from '../src/rendering/cardArt/drawCourtSprite.js';
import { quantizeImageData } from '../src/rendering/cardArt/pixelateIllustration.js';

test('pixel art rasters increase fidelity and high detail stays vector', () => {
  assert.deepEqual(ART_RASTERS['coarse-pixel'], {
    width: 30,
    height: 56,
    paletteSteps: 8,
  });
  assert.deepEqual(ART_RASTERS['detailed-pixel'], {
    width: 60,
    height: 112,
    paletteSteps: 16,
  });
  assert.equal(getArtRaster('high-detail'), null);
});

test('unknown art levels are rejected at every public lookup boundary', () => {
  assert.throws(() => getArtRaster('bogus'), /Unknown card art level/);
  assert.throws(() => getArtRaster('toString'), /Unknown card art level/);
  assert.throws(() => cardBackDetail('bogus'), /Unknown card art level/);
});

test('card-back lattice gains detail monotonically', () => {
  assert.deepEqual(
    ['coarse-pixel', 'detailed-pixel', 'high-detail'].map(cardBackDetail),
    [
      { latticeSpacing: 18, lineWidth: 3 },
      { latticeSpacing: 12, lineWidth: 2 },
      { latticeSpacing: 8, lineWidth: 1 },
    ],
  );
});

test('court dispatch draws the master directly only at high detail', () => {
  const calls = [];
  const services = {
    drawMaster: (...args) => calls.push(['master', ...args.slice(2)]),
    pixelate: (...args) => calls.push(['pixelate', args.at(-1)]),
  };
  const bounds = { x: 4, y: 6, width: 100, height: 140 };
  const card = { rank: 'K', suitColor: '#1a1a1a', suitSymbol: '♣' };

  drawCourtArt({}, bounds, card, 'high-detail', services);
  drawCourtArt({}, bounds, card, 'detailed-pixel', services);

  assert.deepEqual(calls, [
    ['master', 'K', '#1a1a1a', '♣'],
    ['pixelate', { width: 60, height: 112, paletteSteps: 16 }],
  ]);
});

test('court dispatch uses a cached native sprite before the procedural fallback', () => {
  const calls = [];
  const image = { native: true };
  const bounds = { x: 4, y: 6, width: 100, height: 140 };
  const card = { rank: 'Q', suitColor: '#c81414', suitSymbol: '♥' };
  const services = {
    getImage: (level, rank) => {
      calls.push(['lookup', level, rank]);
      return image;
    },
    drawSprite: (...args) => calls.push(['sprite', ...args.slice(1)]),
    drawMaster: () => calls.push(['master']),
    pixelate: () => calls.push(['pixelate']),
  };

  drawCourtArt({}, bounds, card, 'detailed-pixel', services);

  assert.deepEqual(calls, [
    ['lookup', 'detailed-pixel', 'Q'],
    ['sprite', bounds, image, '#c81414', '♥'],
  ]);
});

test('court dispatch falls back to the existing raster or master art when a native sprite is absent', () => {
  const calls = [];
  const card = { rank: 'K', suitColor: '#1a1a1a', suitSymbol: '♣' };
  const services = {
    getImage: () => null,
    drawMaster: (...args) => calls.push(['master', ...args.slice(2)]),
    pixelate: (...args) => calls.push(['pixelate', args.at(-1)]),
  };

  drawCourtArt({}, { x: 0, y: 0, width: 100, height: 140 }, card, 'coarse-pixel', services);
  drawCourtArt({}, { x: 0, y: 0, width: 100, height: 140 }, card, 'high-detail', services);

  assert.deepEqual(calls, [
    ['pixelate', { width: 30, height: 56, paletteSteps: 8 }],
    ['master', 'K', '#1a1a1a', '♣'],
  ]);
});

test('court sprite disables smoothing while drawing the image and adds two suit marks afterwards', () => {
  const calls = [];
  const context = {
    imageSmoothingEnabled: true,
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    drawImage: image => calls.push(['drawImage', image, context.imageSmoothingEnabled]),
    fillText: (symbol, x, y) => calls.push(['fillText', symbol, x, y]),
    translate: (x, y) => calls.push(['translate', x, y]),
    rotate: radians => calls.push(['rotate', radians]),
  };
  const image = { native: true };

  drawCourtSprite(context, { x: 10, y: 20, width: 100, height: 140 }, image, '#c81414', '♥');

  assert.deepEqual(calls.filter(call => call[0] === 'drawImage'), [['drawImage', image, false]]);
  const marks = calls.filter(call => call[0] === 'fillText');
  assert.deepEqual(marks, [
    ['fillText', '♥', 60, 74.6],
    ['fillText', '♥', 0, 0],
  ]);
  assert.ok(calls.findIndex(call => call[0] === 'drawImage') < calls.findIndex(call => call[0] === 'fillText'));
});

test('joker dispatch uses distinct deterministic rasters for both pixel levels', () => {
  const calls = [];
  const services = {
    drawMaster: () => calls.push(['master']),
    pixelate: (...args) => calls.push(['pixelate', args.at(-1)]),
  };
  const bounds = { x: 0, y: 0, width: 100, height: 140 };

  drawJokerArt({}, bounds, 'coarse-pixel', services);
  drawJokerArt({}, bounds, 'detailed-pixel', services);
  drawJokerArt({}, bounds, 'high-detail', services);

  assert.deepEqual(calls, [
    ['pixelate', { width: 30, height: 56, paletteSteps: 8 }],
    ['pixelate', { width: 60, height: 112, paletteSteps: 16 }],
    ['master'],
  ]);
});

test('pixel art rasterization removes partial-alpha vector edges', () => {
  const image = {
    data: new Uint8ClampedArray([
      117, 53, 211, 127,
      117, 53, 211, 128,
    ]),
  };
  const context = {
    getImageData: () => image,
    putImageData: () => {},
  };

  quantizeImageData(context, 2, 1, 8);

  assert.deepEqual([...image.data], [109, 36, 219, 0, 109, 36, 219, 255]);
});

test('card component resolves generic art fidelity from the active profile', () => {
  const card = new CardRenderComponent();
  card._renderSystem = { activeDisplayProfile: { cardArtLevel: 'detailed-pixel' } };
  assert.equal(card._cardArtLevel(), 'detailed-pixel');

  card._renderSystem.activeDisplayProfile.cardArtLevel = 'high-detail';
  assert.equal(card._cardArtLevel(), 'high-detail');

  card._renderSystem = null;
  assert.equal(card._cardArtLevel(), 'high-detail');
});

test('court card corner indices draw above the illustration', () => {
  const calls = [];
  const context = {
    canvas: { width: 100, height: 140 },
    measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, closePath() {},
    fill() {}, stroke() {}, save() {}, restore() {}, translate() {}, rotate() {},
    fillRect() {}, ellipse() {}, quadraticCurveTo() {},
    fillText: text => calls.push(text),
  };
  const card = new CardRenderComponent();
  card._renderSystem = { activeDisplayProfile: { cardArtLevel: 'high-detail' } };

  card.drawCard(context, { suit: 'Clubs', value: 'K' });

  assert.deepEqual(calls.slice(-4), ['K', '♣', 'K', '♣']);
});
