const ROLE_STYLE = Object.freeze({
  K: Object.freeze({ headwear: 'crown', coat: '#2848c0', accent: '#e8c040' }),
  Q: Object.freeze({ headwear: 'tiara', coat: '#c81414', accent: '#2848c0' }),
  J: Object.freeze({ headwear: 'cap', coat: '#e8c040', accent: '#c81414' }),
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

function drawHeadwear(ctx, w, h, style) {
  ctx.fillStyle = style.accent;
  ctx.beginPath();
  if (style.headwear === 'crown') {
    ctx.moveTo(w * 0.28, h * 0.23); ctx.lineTo(w * 0.34, h * 0.04);
    ctx.lineTo(w * 0.44, h * 0.18); ctx.lineTo(w * 0.5, 0);
    ctx.lineTo(w * 0.56, h * 0.18); ctx.lineTo(w * 0.66, h * 0.04);
    ctx.lineTo(w * 0.72, h * 0.23);
  } else if (style.headwear === 'tiara') {
    ctx.moveTo(w * 0.31, h * 0.21); ctx.lineTo(w * 0.42, h * 0.08);
    ctx.lineTo(w * 0.5, h * 0.17); ctx.lineTo(w * 0.58, h * 0.08);
    ctx.lineTo(w * 0.69, h * 0.21);
  } else {
    ctx.moveTo(w * 0.25, h * 0.21); ctx.quadraticCurveTo(w * 0.38, 0, w * 0.5, h * 0.16);
    ctx.quadraticCurveTo(w * 0.68, 0, w * 0.75, h * 0.21);
  }
  ctx.closePath();
  ctx.fill();
}

function drawCourtHalf(ctx, bounds, style, suitColor, suitSymbol) {
  const { width: w, height: h } = bounds;
  ctx.fillStyle = style.coat;
  ctx.beginPath();
  ctx.moveTo(w * 0.12, h); ctx.lineTo(w * 0.26, h * 0.55);
  ctx.lineTo(w * 0.74, h * 0.55); ctx.lineTo(w * 0.88, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = style.accent;
  ctx.beginPath();
  ctx.moveTo(w * 0.24, h); ctx.lineTo(w * 0.42, h * 0.58); ctx.lineTo(w * 0.5, h);
  ctx.moveTo(w * 0.76, h); ctx.lineTo(w * 0.58, h * 0.58); ctx.lineTo(w * 0.5, h);
  ctx.fill();
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.38, w * 0.19, h * 0.23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(w * 0.42, h * 0.34, w * 0.025, h * 0.025);
  ctx.fillRect(w * 0.555, h * 0.34, w * 0.025, h * 0.025);
  ctx.strokeStyle = '#7a4028';
  ctx.lineWidth = Math.max(1, w * 0.015);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.37); ctx.lineTo(w * 0.48, h * 0.45); ctx.lineTo(w * 0.52, h * 0.45);
  ctx.moveTo(w * 0.43, h * 0.50); ctx.quadraticCurveTo(w * 0.5, h * 0.54, w * 0.57, h * 0.50);
  ctx.stroke();
  drawHeadwear(ctx, w, h, style);
  ctx.fillStyle = suitColor;
  ctx.font = `${Math.round(w * 0.20)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(suitSymbol, w * 0.5, h * 0.78);
}

export function drawCourtMaster(ctx, bounds, rank, suitColor, suitSymbol) {
  const style = ROLE_STYLE[rank];
  if (!style) throw new TypeError(`Unsupported court rank: ${rank}`);
  const { x, y, width, height } = bounds;
  ctx.save();
  ctx.translate(x, y);
  roundedRect(ctx, width * 0.13, height * 0.08, width * 0.74, height * 0.84, width * 0.04);
  ctx.fillStyle = '#f5f5ee';
  ctx.fill();
  ctx.strokeStyle = suitColor;
  ctx.lineWidth = Math.max(1, width * 0.012);
  ctx.stroke();
  drawCourtHalf(ctx, { width, height: height / 2 }, style, suitColor, suitSymbol);
  ctx.translate(width, height);
  ctx.rotate(Math.PI);
  drawCourtHalf(ctx, { width, height: height / 2 }, style, suitColor, suitSymbol);
  ctx.restore();
}

export function drawJokerMaster(ctx, bounds) {
  const { x, y, width: w, height: h } = bounds;
  ctx.save();
  ctx.translate(x, y);
  const panel = { x: w * 0.27, y: h * 0.20, width: w * 0.46, height: h * 0.60 };
  roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, w * 0.04);
  ctx.fillStyle = '#f2ecf8'; ctx.fill();
  ctx.strokeStyle = '#7a2fb0'; ctx.lineWidth = Math.max(2, w * 0.016); ctx.stroke();
  const fx = w / 2, fr = panel.width * 0.28, fy = panel.y + panel.height * 0.52;
  const capBase = fy - fr * 0.55;
  const point = (x0, x1, tipX, tipY, color) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x0, capBase); ctx.lineTo(tipX, tipY); ctx.lineTo(x1, capBase); ctx.closePath(); ctx.fill();
  };
  point(fx - fr, fx - fr * 0.1, fx - fr * 1.45, capBase - fr * 1.25, '#c81414');
  point(fx + fr * 0.1, fx + fr, fx + fr * 1.45, capBase - fr * 1.25, '#c81414');
  point(fx - fr * 0.65, fx + fr * 0.65, fx, capBase - fr * 1.95, '#7a2fb0');
  ctx.fillStyle = '#e8c040';
  for (const [bx, by] of [[fx - fr * 1.45, capBase - fr * 1.25], [fx + fr * 1.45, capBase - fr * 1.25], [fx, capBase - fr * 1.95]]) {
    ctx.beginPath(); ctx.arc(bx, by, fr * 0.18, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  for (const ex of [fx - fr * 0.38, fx + fr * 0.38]) { ctx.beginPath(); ctx.arc(ex, fy - fr * 0.15, fr * 0.09, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = Math.max(1.5, w * 0.008);
  ctx.beginPath(); ctx.arc(fx, fy + fr * 0.15, fr * 0.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  const ruffY = fy + fr, teeth = 6, ruffW = fr * 2.2, tooth = ruffW / teeth;
  for (let i = 0; i < teeth; i++) {
    const x0 = fx - ruffW / 2 + i * tooth;
    ctx.fillStyle = i % 2 ? '#c81414' : '#e8c040';
    ctx.beginPath(); ctx.moveTo(x0, ruffY); ctx.lineTo(x0 + tooth / 2, ruffY + fr * 0.55); ctx.lineTo(x0 + tooth, ruffY); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
