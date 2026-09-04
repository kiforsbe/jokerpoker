import { drawCourtMaster, drawJokerMaster } from './courtIllustration.js';
import { pixelateIllustration } from './pixelateIllustration.js';

export const ART_RASTERS = Object.freeze({
  'coarse-pixel': Object.freeze({ width: 30, height: 56, paletteSteps: 8 }),
  'detailed-pixel': Object.freeze({ width: 60, height: 112, paletteSteps: 16 }),
  'high-detail': null,
});

const BACK_DETAIL = Object.freeze({
  'coarse-pixel': Object.freeze({ latticeSpacing: 18, lineWidth: 3 }),
  'detailed-pixel': Object.freeze({ latticeSpacing: 12, lineWidth: 2 }),
  'high-detail': Object.freeze({ latticeSpacing: 8, lineWidth: 1 }),
});

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function getArtRaster(level) {
  if (!Object.hasOwn(ART_RASTERS, level)) throw new TypeError(`Unknown card art level: ${level}`);
  return ART_RASTERS[level];
}

export function cardBackDetail(level) {
  getArtRaster(level);
  return BACK_DETAIL[level];
}

export function drawCourtArt(ctx, bounds, cardStyle, level, services = {}) {
  const drawMaster = services.drawMaster ?? drawCourtMaster;
  const pixelate = services.pixelate ?? pixelateIllustration;
  const raster = getArtRaster(level);
  const draw = (target, targetBounds) => drawMaster(target, targetBounds, cardStyle.rank, cardStyle.suitColor, cardStyle.suitSymbol);
  return raster ? pixelate(ctx, bounds, draw, raster) : draw(ctx, bounds);
}

export function drawJokerArt(ctx, bounds, level, services = {}) {
  const drawMaster = services.drawMaster ?? drawJokerMaster;
  const pixelate = services.pixelate ?? pixelateIllustration;
  const raster = getArtRaster(level);
  const draw = (target, targetBounds) => drawMaster(target, targetBounds);
  return raster ? pixelate(ctx, bounds, draw, raster) : draw(ctx, bounds);
}

export function drawCardBackArt(ctx, bounds, level) {
  const detail = cardBackDetail(level);
  const { x, y, width, height } = bounds;
  const radius = width * 0.09, inset = width * 0.05;
  const inner = { x: x + inset, y: y + inset, width: width - inset * 2, height: height - inset * 2 };
  ctx.save();
  roundedRect(ctx, x, y, width, height, radius); ctx.fillStyle = '#f5f5ee'; ctx.fill();
  roundedRect(ctx, inner.x, inner.y, inner.width, inner.height, radius * 0.7); ctx.fillStyle = '#b3271a'; ctx.fill();
  roundedRect(ctx, inner.x, inner.y, inner.width, inner.height, radius * 0.7); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = detail.lineWidth;
  for (let offset = -height; offset < width + height; offset += detail.latticeSpacing) {
    ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset + height, y + height);
    ctx.moveTo(x + offset, y + height); ctx.lineTo(x + offset + height, y); ctx.stroke();
  }
  ctx.restore();
  const panelWidth = width * 0.34, panelHeight = height * 0.30;
  const panelX = x + (width - panelWidth) / 2, panelY = y + (height - panelHeight) / 2;
  ctx.save();
  roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, width * 0.03);
  ctx.fillStyle = '#f5f5ee'; ctx.fill(); ctx.strokeStyle = '#b3271a'; ctx.lineWidth = Math.max(1, detail.lineWidth); ctx.stroke();
  ctx.fillStyle = '#b3271a'; ctx.font = `${Math.round(width * 0.22)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('♣', x + width / 2, y + height / 2);
  roundedRect(ctx, inner.x, inner.y, inner.width, inner.height, radius * 0.7);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, detail.lineWidth * 1.5); ctx.stroke();
  ctx.restore();
}
