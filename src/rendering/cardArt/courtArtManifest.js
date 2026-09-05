export const COURT_ART_LEVELS = Object.freeze(['coarse-pixel', 'detailed-pixel', 'high-detail']);
export const COURT_RANKS = Object.freeze(['K', 'Q', 'J']);

const LEVEL_SPECS = {
  'coarse-pixel': { directory: 'eighties', width: 30, height: 56, paletteLimit: 16 },
  'detailed-pixel': { directory: 'nineties', width: 60, height: 112, paletteLimit: 32 },
  'high-detail': { directory: 'early2000s', width: 120, height: 224, paletteLimit: 64 },
};

const configuredCourtArtBaseUrl = globalThis.__JOKER_POKER_COURT_ART_BASE_URL__;
const courtArtBaseUrl = configuredCourtArtBaseUrl
  ? new URL(configuredCourtArtBaseUrl)
  : new URL('../../../assets/cards/courts/', import.meta.url);

export const COURT_ART_MANIFEST = Object.freeze(Object.fromEntries(
  COURT_ART_LEVELS.map(level => [level, Object.freeze(Object.fromEntries(
    COURT_RANKS.map(rank => {
      const spec = LEVEL_SPECS[level];
      return [rank, Object.freeze({
        width: spec.width,
        height: spec.height,
        paletteLimit: spec.paletteLimit,
        url: new URL(`${spec.directory}/${rank}.png`, courtArtBaseUrl),
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
