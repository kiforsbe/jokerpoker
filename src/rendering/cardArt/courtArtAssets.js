import { COURT_ART_LEVELS, COURT_RANKS, getCourtArtSpec } from './courtArtManifest.js';

const cache = new Map();
const cacheKey = (level, rank) => `${level}:${rank}`;

async function loadBrowserImage(url) {
  if (typeof globalThis.Image !== 'function') throw new Error('Image decoding is unavailable');
  const image = new globalThis.Image();
  image.decoding = 'async';
  if (typeof image.decode === 'function') {
    image.src = url.href;
    await image.decode();
  } else {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Could not load ${url.href}`));
      image.src = url.href;
    });
  }
  return image;
}

export function clearCourtArtCache() {
  cache.clear();
}

export function getCourtArtImage(level, rank) {
  getCourtArtSpec(level, rank);
  return cache.get(cacheKey(level, rank)) ?? null;
}

export async function preloadCourtArt({ loadImage = loadBrowserImage } = {}) {
  const failed = [];
  let loaded = 0;
  for (const level of COURT_ART_LEVELS) {
    for (const rank of COURT_RANKS) {
      const spec = getCourtArtSpec(level, rank);
      try {
        const image = await loadImage(spec.url, spec);
        if (image.naturalWidth !== spec.width || image.naturalHeight !== spec.height) {
          throw new Error(`${level} ${rank} has invalid native size ${image.naturalWidth}x${image.naturalHeight}`);
        }
        cache.set(cacheKey(level, rank), image);
        loaded += 1;
      } catch (error) {
        cache.delete(cacheKey(level, rank));
        failed.push({ level, rank, error });
      }
    }
  }
  return { loaded, failed };
}
