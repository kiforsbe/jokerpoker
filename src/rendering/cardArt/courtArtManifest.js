export const COURT_ART_LEVELS = Object.freeze(['coarse-pixel', 'detailed-pixel', 'high-detail']);
export const COURT_RANKS = Object.freeze(['K', 'Q', 'J']);

const LEVEL_SPECS = {
  'coarse-pixel': { directory: 'eighties', width: 30, height: 56, paletteLimit: 16 },
  'detailed-pixel': { directory: 'nineties', width: 60, height: 112, paletteLimit: 32 },
  'high-detail': { directory: 'early2000s', width: 120, height: 224, paletteLimit: 64 },
};

export const COURT_ART_MANIFEST = Object.freeze(Object.fromEntries(
  COURT_ART_LEVELS.map(level => [level, Object.freeze(Object.fromEntries(
    COURT_RANKS.map(rank => {
      const spec = LEVEL_SPECS[level];
      return [rank, Object.freeze({
        width: spec.width,
        height: spec.height,
        paletteLimit: spec.paletteLimit,
        url: new URL(`../../../assets/cards/courts/${spec.directory}/${rank}.png`, import.meta.url),
      })];
    }),
  ))]),
));

export function getCourtArtSpec(level, rank) {
  if (!Object.hasOwn(COURT_ART_MANIFEST, level)) {
    throw new TypeError(`Unknown court art level: ${level}`);
  }
  if (!Object.hasOwn(COURT_ART_MANIFEST[level], rank)) {
    throw new TypeError(`Unknown court rank: ${rank}`);
  }
  return COURT_ART_MANIFEST[level][rank];
}
