export function quantizeImageData(ctx, width, height, paletteSteps) {
  const image = ctx.getImageData(0, 0, width, height);
  const bucket = 255 / (paletteSteps - 1);
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = Math.round(image.data[index] / bucket) * bucket;
    image.data[index + 1] = Math.round(image.data[index + 1] / bucket) * bucket;
    image.data[index + 2] = Math.round(image.data[index + 2] / bucket) * bucket;
  }
  ctx.putImageData(image, 0, 0);
}

export function pixelateIllustration(ctx, bounds, drawMaster, raster) {
  const canvas = globalThis.document?.createElement('canvas');
  if (!canvas) throw new Error('Pixel card art requires a canvas-capable document');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const source = canvas.getContext('2d', { willReadFrequently: true });
  drawMaster(source, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  quantizeImageData(source, canvas.width, canvas.height, raster.paletteSteps);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();
}

