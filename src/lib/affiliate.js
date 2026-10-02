import {
  AVCAMS,
  STRIPCASH_SOURCE_ID,
  STRIPCASH_TRACKING_URL,
  STRIPCASH_USER_ID
} from '../config/site.js';

export function buildAvcamsUrl({
  pagePath,
  placement,
  label,
  destinationPath = AVCAMS.defaultPath
}) {
  const url = new URL(STRIPCASH_TRACKING_URL);
  const pageKey = pagePathToKey(pagePath);
  const campaignId = classifyCampaign(pageKey);
  const creativeId = sanitizeTrackingValue(label || 'explore_avcams');
  const normalizedDestinationPath = normalizeAvcamsPath(destinationPath);

  url.searchParams.set('userId', STRIPCASH_USER_ID);
  url.searchParams.set('campaignId', campaignId);
  url.searchParams.set('creativeId', creativeId);
  url.searchParams.set('sourceId', STRIPCASH_SOURCE_ID);
  url.searchParams.set('p1', pageKey);
  url.searchParams.set('p2', sanitizeTrackingValue(placement || 'unknown'));
  url.searchParams.set('targetDomain', AVCAMS.domain);
  url.searchParams.set('path', normalizedDestinationPath);

  // memberId and p3 are attached in the browser at click time:
  // - memberId is our click identifier for StripCash postback reconciliation.
  // - p3 carries first-touch acquisition (google, bing, blog, direct, etc.).
  return {
    url: url.toString(),
    campaignId,
    creativeId,
    pageKey,
    placement: sanitizeTrackingValue(placement || 'unknown'),
    targetDomain: AVCAMS.domain,
    destinationPath: normalizedDestinationPath
  };
}

export function normalizeAvcamsPath(value) {
  const raw = String(value || AVCAMS.defaultPath).trim();
  if (!raw || raw === '/') return '/';
  if (/^https?:\/\//i.test(raw)) {
    throw new Error('AVCams destinationPath must be a path, not a full URL.');
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
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
  if (['stripchat', 'chaturbate', 'livejasmin', 'avcams'].includes(key)) return 'su_livecam_review';

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
