import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { getCourtArtSpec } from '../src/rendering/cardArt/courtArtManifest.js';

const ROWS = [
  { level: 'coarse-pixel', ranks: ['K', 'Q', 'J'] },
  { level: 'detailed-pixel', ranks: ['K', 'Q', 'J'] },
  { level: 'high-detail', ranks: ['K', 'Q', 'J'] },
];

const atlasPath = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../assets/cards/courts/source/court-atlas.png', import.meta.url));

function pixelOffset(png, x, y) {
  return (y * png.width + x) * 4;
}

function cellBounds(atlas, column, row) {
  return {
    left: Math.floor(column * atlas.width / 3),
    top: Math.floor(row * atlas.height / 3),
    right: Math.floor((column + 1) * atlas.width / 3) - 1,
    bottom: Math.floor((row + 1) * atlas.height / 3) - 1,
  };
}

function opaqueBounds(atlas, cell) {
  let left = cell.right + 1;
  let top = cell.bottom + 1;
  let right = cell.left - 1;
  let bottom = cell.top - 1;

  for (let y = cell.top; y <= cell.bottom; y += 1) {
    for (let x = cell.left; x <= cell.right; x += 1) {
      if (atlas.data[pixelOffset(atlas, x, y) + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    throw new Error(`Empty atlas cell at column ${cell.left}, row ${cell.top}`);
  }
  return { left, top, right, bottom };
}

function buildSprite(atlas, bounds, spec) {
  const sprite = new PNG({ width: spec.width, height: spec.height });
  const halfHeight = spec.height / 2;
  const sourceWidth = bounds.right - bounds.left + 1;
  const sourceHeight = Math.ceil((bounds.bottom - bounds.top + 1) / 2);
  const destinationWidth = spec.width - 2;

  for (let y = 0; y < halfHeight; y += 1) {
    const sourceY = bounds.top + Math.floor(y * sourceHeight / halfHeight);
    for (let x = 0; x < destinationWidth; x += 1) {
      const sourceX = bounds.left + Math.floor(x * sourceWidth / destinationWidth);
      const sourceOffset = pixelOffset(atlas, sourceX, sourceY);
      const destinationOffset = pixelOffset(sprite, x + 1, y);
      sprite.data.set(atlas.data.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
    }
  }

  for (let y = 0; y < halfHeight; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const sourceOffset = pixelOffset(sprite, x, y);
      const destinationOffset = pixelOffset(sprite, spec.width - 1 - x, spec.height - 1 - y);
      sprite.data.set(sprite.data.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
    }
  }

  for (let offset = 0; offset < sprite.data.length; offset += 4) {
    if (sprite.data[offset + 3] < 128) {
      sprite.data[offset + 3] = 0;
    } else {
      sprite.data[offset + 3] = 255;
    }
  }

  return sprite;
}

function paletteFor(sprite, limit) {
  const buckets = new Map();
  for (let offset = 0; offset < sprite.data.length; offset += 4) {
    if (sprite.data[offset + 3] !== 255) continue;
    const red = sprite.data[offset] & 0xf0;
    const green = sprite.data[offset + 1] & 0xf0;
    const blue = sprite.data[offset + 2] & 0xf0;
    const key = red * 65536 + green * 256 + blue;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets]
    .sort(([firstKey, firstCount], [secondKey, secondCount]) => secondCount - firstCount || firstKey - secondKey)
    .slice(0, limit)
    .map(([key]) => [Math.floor(key / 65536), Math.floor(key / 256) % 256, key % 256]);
}

function nearestColor(red, green, blue, palette) {
  let nearest = palette[0];
  let nearestDistance = Infinity;
  for (const color of palette) {
    const distance = (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2;
    if (distance < nearestDistance) {
      nearest = color;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function reducePalette(sprite, limit) {
  const palette = paletteFor(sprite, limit);
  if (palette.length === 0) throw new Error('Sprite has no opaque pixels');
  for (let offset = 0; offset < sprite.data.length; offset += 4) {
    if (sprite.data[offset + 3] !== 255) continue;
    const color = nearestColor(sprite.data[offset], sprite.data[offset + 1], sprite.data[offset + 2], palette);
    sprite.data[offset] = color[0];
    sprite.data[offset + 1] = color[1];
    sprite.data[offset + 2] = color[2];
  }
  return palette;
}

function validateSprite(png, spec) {
  if (png.width !== spec.width || png.height !== spec.height) {
    throw new Error(`Invalid dimensions ${png.width}x${png.height}`);
  }
  const colors = new Set();
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = pixelOffset(png, x, y);
      const alpha = png.data[offset + 3];
      if (alpha !== 0 && alpha !== 255) throw new Error(`Partial alpha ${alpha} at ${x},${y}`);
      if (alpha === 255) colors.add(`${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]}`);
      const mirrorOffset = pixelOffset(png, png.width - 1 - x, png.height - 1 - y);
      for (let channel = 0; channel < 4; channel += 1) {
        if (png.data[offset + channel] !== png.data[mirrorOffset + channel]) {
          throw new Error(`Mirror mismatch at ${x},${y}`);
        }
      }
    }
  }
  if (colors.size > spec.paletteLimit) {
    throw new Error(`${colors.size} colors exceeds palette limit ${spec.paletteLimit}`);
  }
  return colors.size;
}

const atlas = PNG.sync.read(await readFile(atlasPath));

for (let row = 0; row < ROWS.length; row += 1) {
  const { level, ranks } = ROWS[row];
  for (let column = 0; column < ranks.length; column += 1) {
    const rank = ranks[column];
    const spec = getCourtArtSpec(level, rank);
    const sprite = buildSprite(atlas, opaqueBounds(atlas, cellBounds(atlas, column, row)), spec);
    reducePalette(sprite, spec.paletteLimit);
    const destination = fileURLToPath(spec.url);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, PNG.sync.write(sprite));
    const colors = validateSprite(PNG.sync.read(await readFile(destination)), spec);
    console.log(`${destination} ${spec.width}x${spec.height} ${colors} colors`);
  }
}
