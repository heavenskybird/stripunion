// Exact, reversible pilot only. No category-wide or lexical brand auto-promotion.
export const webmasterPilot = new Set([
  'adult-affiliate-webmaster-program-evaluation-guide',
  'adult-affiliate-program-business-model-structure-comparison',
  'adult-affiliate-program-application-readiness'
]);
export const viewerPilot = new Set([
  'live-cam-platform-model-fit-comparison',
  'live-cam-private-interaction-visibility-choice'
]);
export function guideCommercialOffer(guide) {
  if (guide?.categorySlug === 'webmaster-affiliate' && webmasterPilot.has(guide.slug)) return 'stripcash-affiliate-referral';
  if (guide?.categorySlug === 'live-cams' && viewerPilot.has(guide.slug)) return 'avcams';
  return null;
}
