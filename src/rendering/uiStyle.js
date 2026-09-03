// Profile-independent visual style for the game UI and card composition.

export const PALETTE = {
  field: '#2050c8',
  surround: '#0a0a12',
  frame: '#e8e8e4',
  statusBg: '#2050c8',
  statusBorder: '#ffffff',
  statusText: '#ffffff',
  betLabelText: '#1a1a1a',
  betOval: '#ffee33',
  betText: '#1a1a1a',
  payText: '#ffffff',
  payHighlight: '#cc0000',
  holdBg: '#7cd8e6',
  holdBorder: '#2050c8',
  holdText: '#2050c8',
};

export const LAYOUT = {
  topBandBottomY: 0.76,
  bottomBandTopY: -0.83,
  holdY: -0.915,
};

export const uiFont = px => `${Math.max(16, Math.round(px * 1.35 / 16) * 16)}px "VT323", monospace`;
export const cardFont = px => `${px}px "VT323", Arial, sans-serif`;

export function fillTextCentered(ctx, text, x, cy, ref = 'Hg') {
  ctx.textBaseline = 'middle';
  const m = ctx.measureText(ref);
  ctx.fillText(text, Math.round(x), Math.round(cy - (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2));
}
