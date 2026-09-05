export const SCREEN_ASPECT = 4 / 3;

export const DISPLAY_PROFILE_ORDER = Object.freeze(['eighties', 'nineties', 'early2000s']);
export const LEGACY_PROFILE_IDS = Object.freeze({ retro: 'eighties', medium: 'nineties', hires: 'early2000s' });

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};

export function validateDisplayProfile(profile) {
  const framebuffer = profile?.framebuffer;
  if (!Number.isInteger(framebuffer?.width) || framebuffer.width <= 0
    || !Number.isInteger(framebuffer?.height) || framebuffer.height <= 0) {
    throw new TypeError('Display profile framebuffer dimensions must be positive integers');
  }
  if (framebuffer.width / framebuffer.height !== SCREEN_ASPECT) {
    throw new TypeError('Display profile framebuffer aspect ratio must be 4:3');
  }
  return true;
}

const profileFixtures = {
  eighties: {
    id: 'eighties', label: '1980s', framebuffer: { width: 640, height: 480 },
    sampling: { scene: 'nearest', textures: 'nearest', output: 'pixelated' },
    cardArtLevel: 'coarse-pixel',
    postProcessing: { crt: {
      enabled: true, scanlineDensity: 0.45, scanlineIntensity: 0.35,
      rgbShiftPixels: 1.50, noise: 0, flicker: 0.012,
      vignetteIntensity: 0.07, brightness: 1, saturation: 1,
      curvature: { x: 4, y: 4 }, cornerRadius: 0.15,
    } },
  },
  nineties: {
    id: 'nineties', label: '1990s', framebuffer: { width: 800, height: 600 },
    sampling: { scene: 'nearest', textures: 'nearest', output: 'pixelated' },
    cardArtLevel: 'detailed-pixel',
    postProcessing: { crt: {
      enabled: true, scanlineDensity: 0.8, scanlineIntensity: 0.14,
      rgbShiftPixels: 0.45, noise: 0.004, flicker: 0.003,
      vignetteIntensity: 0.03, brightness: 1, saturation: 1,
      curvature: { x: 6.5, y: 6.5 }, cornerRadius: 0.035,
    } },
  },
  early2000s: {
    id: 'early2000s', label: 'Early 2000s', framebuffer: { width: 1024, height: 768 },
    sampling: { scene: 'linear', textures: 'linear', output: 'auto' },
    cardArtLevel: 'high-detail',
    postProcessing: { crt: {
      enabled: false, scanlineDensity: 0, scanlineIntensity: 0,
      rgbShiftPixels: 0, noise: 0, flicker: 0,
      vignetteIntensity: 0, brightness: 1, saturation: 1,
      curvature: { x: 1000, y: 1000 }, cornerRadius: 0,
    } },
  },
};

DISPLAY_PROFILE_ORDER.forEach((id) => validateDisplayProfile(profileFixtures[id]));
export const DISPLAY_PROFILES = freezeDeep(profileFixtures);

export function getDisplayProfile(id) {
  return DISPLAY_PROFILES[id] ?? null;
}

export function pixelsPerWorldUnit(profile) {
  validateDisplayProfile(profile);
  return profile.framebuffer.width / (2 * SCREEN_ASPECT);
}
