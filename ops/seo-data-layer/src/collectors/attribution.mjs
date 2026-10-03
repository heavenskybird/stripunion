import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const API_URL =
  process.env.STRIPUNION_ATTRIBUTION_API_URL?.trim() ||
  'https://stripunion-live-models.stripunion.workers.dev/analytics/summary';
const token = process.env.STRIPCASH_POSTBACK_SECRET?.trim();
const snapshotDate = process.env.SEO_END_DATE || daysAgo(1);

if (!token) throw new Error('STRIPCASH_POSTBACK_SECRET is not configured.');

const response = await fetch(API_URL, {
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/json'
  },
  signal: AbortSignal.timeout(15000)
});

if (!response.ok) {
  throw new Error(`StripUnion attribution summary returned HTTP ${response.status}.`);
}

const payload = await response.json();
if (payload?.ok !== true || !payload?.summary || typeof payload.summary !== 'object') {
  throw new Error('StripUnion attribution summary payload is invalid.');
}

const summary = payload.summary;
const normalized = {
  collectedAt: new Date().toISOString(),
  receiverConnected: true,
  postbackJoinReady: true,
  reportScope: 'first-party AVCams click/postback attribution',
  totalClicks: Number(summary.totalClicks || 0),
  totalPostbacks: Number(summary.totalPostbacks || 0),
  matchedPostbacks: Number(summary.matchedPostbacks || 0),
  unmatchedPostbacks: Number(summary.unmatchedPostbacks || 0),
  duplicatePostbacks: Number(summary.duplicatePostbacks || 0),
  eventCounts: summary.eventCounts && typeof summary.eventCounts === 'object' ? summary.eventCounts : {},
  revenueByCurrency: summary.revenueByCurrency && typeof summary.revenueByCurrency === 'object' ? summary.revenueByCurrency : {},
  byP1: summary.byP1 && typeof summary.byP1 === 'object' ? summary.byP1 : {},
  byAffiliateSource: summary.byAffiliateSource && typeof summary.byAffiliateSource === 'object' ? summary.byAffiliateSource : {},
  updatedAt: summary.updatedAt || null
};

await writeSnapshot('attribution', snapshotDate, normalized);
console.log(
  `First-party attribution collected: clicks=${normalized.totalClicks}, postbacks=${normalized.totalPostbacks}, matched=${normalized.matchedPostbacks}.`
);
