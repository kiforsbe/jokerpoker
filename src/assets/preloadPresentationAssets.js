import { preloadCourtArt } from '../rendering/cardArt/courtArtAssets.js';

export async function preloadPresentationAssets({
  fonts = globalThis.document?.fonts,
  preloadCourts = preloadCourtArt,
  logger = console,
} = {}) {
  if (fonts?.load) {
    try {
      await fonts.load('32px "VT323"');
    } catch (error) {
      logger.log('WARN', 'Presentation font preload failed; using fallback', { error: error.message });
    }
  }
  const report = await preloadCourts();
  for (const failure of report.failed) {
    logger.log('WARN', 'Court art preload failed; using procedural fallback', {
      level: failure.level, rank: failure.rank, error: failure.error.message,
    });
  }
  return report;
}
