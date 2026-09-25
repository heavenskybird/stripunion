import {
  STRIPCHAT_AFFILIATE_URL,
  STRIPCASH_SOURCE_ID
} from '../config/site.js';

export function buildStripcashUrl(source) {
  const url = new URL(STRIPCHAT_AFFILIATE_URL);

  // Confirmed in Stripcash Links & Creatives documentation/screens:
  // sourceId and p1 are supported tracking parameters on regular links.
  url.searchParams.set('sourceId', STRIPCASH_SOURCE_ID);
  url.searchParams.set('p1', sanitizeTrackingValue(source || 'unknown'));

  return url.toString();
}

function sanitizeTrackingValue(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}
