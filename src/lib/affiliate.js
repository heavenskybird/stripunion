import {
  STRIPCHAT_AFFILIATE_URL,
  STRIPCASH_SOURCE_ID
} from '../config/site.js';

export function buildStripcashUrl({ pagePath, placement, label }) {
  const url = new URL(STRIPCHAT_AFFILIATE_URL);
  const pageKey = pagePathToKey(pagePath);
  const campaignId = classifyCampaign(pageKey);
  const creativeId = sanitizeTrackingValue(label || 'try_stripchat');

  url.searchParams.set('campaignId', campaignId);
  url.searchParams.set('creativeId', creativeId);
  url.searchParams.set('sourceId', STRIPCASH_SOURCE_ID);
  url.searchParams.set('p1', pageKey);
  url.searchParams.set('p2', sanitizeTrackingValue(placement || 'unknown'));

  // p3 is attached in the browser at click time so it can carry
  // first-touch acquisition source (google, bing, stripunion_blog, direct, etc.).
  return {
    url: url.toString(),
    campaignId,
    creativeId,
    pageKey,
    placement: sanitizeTrackingValue(placement || 'unknown')
  };
}

export function pagePathToKey(pagePath) {
  const clean = String(pagePath || '/')
    .split('?')[0]
    .replace(/^\/+|\/+$/g, '');

  return sanitizeTrackingValue(clean || 'homepage');
}

export function classifyCampaign(pageKey) {
  const key = sanitizeTrackingValue(pageKey);

  if (key === 'homepage') return 'su_home';
  if (key.includes('_vs_') || key.includes('-vs-')) return 'su_livecam_comparison';
  if (key.includes('alternatives')) return 'su_livecam_alternatives';
  if (key.includes('pricing') || key.includes('tokens')) return 'su_livecam_pricing';
  if (key.startsWith('best_') || key.startsWith('best-')) return 'su_livecam_best';
  if (key === 'live_cams' || key === 'live-cams') return 'su_livecam_hub';
  if (key.includes('private') || key.includes('app') || key.includes('magic_search') || key.includes('magic-search')) return 'su_livecam_feature';
  if (['stripchat','chaturbate','livejasmin'].includes(key)) return 'su_livecam_review';

  return 'su_crosssell';
}

export function sanitizeTrackingValue(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}
