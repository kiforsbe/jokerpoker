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
