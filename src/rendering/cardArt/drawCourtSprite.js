export function drawCourtSprite(ctx, bounds, image, suitColor, suitSymbol) {
  const { x, y, width, height } = bounds;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = suitColor;
  ctx.font = `${Math.round(width * 0.20)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(suitSymbol, x + width * 0.5, y + height * 0.39);
  ctx.translate(x + width * 0.5, y + height * 0.61);
  ctx.rotate(Math.PI);
  ctx.fillText(suitSymbol, 0, 0);
  ctx.restore();
}
