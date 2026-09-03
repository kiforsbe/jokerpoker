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
      enabled: true, scanlineDensity: 0.50, scanlineIntensity: 0.16,
      rgbShiftPixels: 1.50, noise: 0.025, flicker: 0.012,
      vignetteIntensity: 0.18, curvature: { x: 3.5, y: 3.5 },
    } },
  },
  nineties: {
    id: 'nineties', label: '1990s', framebuffer: { width: 800, height: 600 },
    sampling: { scene: 'nearest', textures: 'nearest', output: 'pixelated' },
    cardArtLevel: 'detailed-pixel',
    postProcessing: { crt: {
      enabled: true, scanlineDensity: 0.60, scanlineIntensity: 0.08,
      rgbShiftPixels: 0.60, noise: 0.008, flicker: 0.003,
      vignetteIntensity: 0.08, curvature: { x: 7, y: 7 },
    } },
  },
  early2000s: {
    id: 'early2000s', label: 'Early 2000s', framebuffer: { width: 1024, height: 768 },
    sampling: { scene: 'linear', textures: 'linear', output: 'auto' },
    cardArtLevel: 'high-detail',
    postProcessing: { crt: {
      enabled: false, scanlineDensity: 0, scanlineIntensity: 0,
      rgbShiftPixels: 0, noise: 0, flicker: 0,
      vignetteIntensity: 0, curvature: { x: 1000, y: 1000 },
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
