import { pixelsPerWorldUnit, validateDisplayProfile } from './displayProfiles.js';

// Keep this module independent of Three.js: these are the stable Three.js
// filter constants, and the rasterizer only needs to assign them to textures.
const NEAREST_FILTER = 1003;
const LINEAR_FILTER = 1006;

function asRegistration(texture, worldWidth, drawCallback, nativeAspectRatio) {
  if (worldWidth && typeof worldWidth === 'object') {
    const options = worldWidth;
    worldWidth = options.worldWidth;
    drawCallback = options.drawCallback ?? options.draw ?? drawCallback;
    nativeAspectRatio = options.nativeAspectRatio;
  }
  if (!texture?.image || typeof texture.image.getContext !== 'function') {
    throw new TypeError('TextureRasterizer.register requires a canvas texture');
  }
  if (!Number.isFinite(worldWidth) || worldWidth <= 0) {
    throw new TypeError('TextureRasterizer world width must be positive');
  }
  if (typeof drawCallback !== 'function') {
    throw new TypeError('TextureRasterizer requires a draw callback');
  }
  const canvas = texture.image;
  const aspect = nativeAspectRatio ?? (canvas.width > 0 && canvas.height > 0
    ? canvas.height / canvas.width : 1);
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new TypeError('TextureRasterizer native aspect ratio must be positive');
  }
  return { texture, worldWidth, drawCallback, nativeAspectRatio: aspect };
}

export class TextureRasterizer {
  constructor(profile, { onDrawError = () => {} } = {}) {
    validateDisplayProfile(profile);
    this.profile = profile;
    this.onDrawError = onDrawError;
    this.registrations = new Map();
  }

  register(texture, worldWidth, drawCallback, nativeAspectRatio) {
    const registration = asRegistration(texture, worldWidth, drawCallback, nativeAspectRatio);
    this.registrations.set(texture, registration);
    this._redrawRegistration(registration);
    return texture;
  }

  unregister(texture) {
    return this.registrations.delete(texture);
  }

  redraw(texture) {
    if (texture !== undefined) {
      const registration = this.registrations.get(texture);
      if (!registration) return false;
      this._redrawRegistration(registration);
      return true;
    }
    for (const registration of this.registrations.values()) this._redrawRegistration(registration);
    return this.registrations.size > 0;
  }

  applyDisplayProfile(profile) {
    validateDisplayProfile(profile);
    this.profile = profile;
    this.redraw();
  }

  _redrawRegistration(registration) {
    const { texture, worldWidth, drawCallback, nativeAspectRatio } = registration;
    const canvas = texture.image;
    const width = Math.max(1, Math.round(worldWidth * pixelsPerWorldUnit(this.profile)));
    const height = Math.max(1, Math.round(width * nativeAspectRatio));
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    if (!context) throw new Error('TextureRasterizer could not acquire a 2D context');
    if (!resized) context.clearRect(0, 0, width, height);
    try {
      drawCallback(context, canvas);
    } catch (error) {
      this._drawError(context, width, height);
      try { this.onDrawError(error, texture); } catch { /* diagnostics must not break rendering */ }
    }
    const filter = this.profile.sampling.textures === 'nearest' ? NEAREST_FILTER : LINEAR_FILTER;
    texture.minFilter = texture.magFilter = filter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
  }

  _drawError(context, width, height) {
    context.fillStyle = 'red';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'white';
    context.font = `${Math.max(10, Math.round(Math.min(width, height) / 8))}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Error', Math.round(width / 2), Math.round(height / 2));
  }
}

export default TextureRasterizer;
