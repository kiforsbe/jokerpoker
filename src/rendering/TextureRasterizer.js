import { pixelsPerWorldUnit, validateDisplayProfile } from './displayProfiles.js';

// Keep this module independent of Three.js: these are the stable Three.js
// filter constants, and the rasterizer only needs to assign them to textures.
const NEAREST_FILTER = 1003;
const LINEAR_FILTER = 1006;

function asRegistration(descriptor) {
  const { label = 'canvas texture', texture, worldWidth, draw } = descriptor ?? {};
  const canvas = descriptor?.canvas ?? texture?.image;
  if (!texture || !canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('TextureRasterizer.register requires a canvas texture');
  }
  if (!Number.isFinite(worldWidth) || worldWidth <= 0) {
    throw new TypeError('TextureRasterizer world width must be positive');
  }
  if (typeof draw !== 'function') {
    throw new TypeError('TextureRasterizer requires a draw callback');
  }
  const nativeWidth = descriptor.nativeWidth ?? canvas.width;
  const nativeHeight = descriptor.nativeHeight ?? canvas.height;
  const aspect = nativeHeight / nativeWidth;
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new TypeError('TextureRasterizer native aspect ratio must be positive');
  }
  return { label, canvas, texture, worldWidth, draw, nativeAspectRatio: aspect };
}

export class TextureRasterizer {
  constructor(profile, { onDrawError = () => {} } = {}) {
    validateDisplayProfile(profile);
    this.profile = profile;
    this.onDrawError = onDrawError;
    this.registrations = new Set();
  }

  register(descriptor) {
    const registration = asRegistration(descriptor);
    const handle = registration;
    this.registrations.add(handle);
    handle.texture.userData ??= {};
    handle.texture.userData.rasterHandle = handle;
    this._redrawRegistration(handle);
    return handle;
  }

  unregister(handle) {
    if (!this.registrations.delete(handle)) return false;
    if (handle.texture.userData?.rasterHandle === handle) delete handle.texture.userData.rasterHandle;
    return true;
  }

  redraw(texture) {
    if (texture !== undefined) {
      if (!this.registrations.has(texture)) return false;
      this._redrawRegistration(texture);
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
    const { texture, canvas, worldWidth, draw, nativeAspectRatio } = registration;
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
      draw(context, canvas);
    } catch (error) {
      this._drawError(context, width, height);
      try { this.onDrawError(error, registration); } catch { /* diagnostics must not break rendering */ }
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
