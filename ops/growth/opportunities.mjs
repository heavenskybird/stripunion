import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviews } from '../../src/data/reviews.js';
import { vrReviews } from '../../src/data/reviews-vr.js';
import { pendingReviews } from '../../src/data/legacy.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '../..');
const dataRoot = path.join(repo, 'ops/seo-data-layer/data/raw');

const readLatest = async (dir, suffix) => {
  try {
    const names = (await fs.readdir(dir)).filter((name) => name.endsWith(suffix)).sort().reverse();
    return names.length
      ? { date: names[0].slice(0, 10), data: JSON.parse(await fs.readFile(path.join(dir, names[0]), 'utf8')) }
      : null;
  } catch {
    return null;
  }
};

const dirs = await fs.readdir(dataRoot).catch(() => []);
const source = async (file) => {
  for (const dir of dirs.filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse()) {
    try {
      return { date: dir, data: JSON.parse(await fs.readFile(path.join(dataRoot, dir, file), 'utf8')) };
    } catch {}
  }
  return null;
};

const [gsc, bing, ga4, clarity, attribution, stripcash, competitor, diff] = await Promise.all([
  source('gsc.json'),
  source('bing.json'),
  source('ga4.json'),
  source('clarity.json'),
  source('attribution.json'),
  source('stripcash.json'),
  readLatest(path.join(root, 'competitors/data/raw'), '.json'),
  readLatest(path.join(root, 'competitors/data/diffs'), '.json')
]);

const directOffers = JSON.parse(await fs.readFile(path.join(root, 'offers/direct-offers.json'), 'utf8'));
const approvedBrands = new Set(
  [
    ...(directOffers.policy?.approved_existing || []),
    ...directOffers.offers
      .filter((offer) => offer.status === 'active' || offer.status === 'underlying_operator')
      .flatMap((offer) => [offer.id, offer.brand])
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
);

const pageFiles = (await fs.readdir(path.join(repo, 'src/pages')))
  .filter((file) => file.endsWith('.astro') && !['404.astro', 'robots.txt.js', 'sitemap.xml.js'].includes(file));
const staticRoutes = new Set(pageFiles.map((file) => file.replace(/\.astro$/, '').toLowerCase()));
const reviewSlugs = new Set(Object.values({ ...reviews, ...vrReviews }).map((review) => review.slug.toLowerCase()));

const candidates = [];
let droppedNoiseQueries = 0;

function keywordImpressions(row = {}) {
  return Number(
    row.BroadImpressions ??
    row.Impressions ??
    row.StrictImpressions ??
    row.Count ??
    row.SearchVolume ??
    0
  );
}

function backlinkTarget(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname || '/';
  } catch {
    return String(url || '');
  }
}

const competitorChanges = (diff?.data?.competitors || [])
  .filter((row) => (row.newUrls || []).length)
  .map((row) => ({
    domain: row.name,
    newUrlCount: row.newUrls.length,
    removedUrlCount: (row.removedUrls || []).length,
    urls: row.newUrls.slice(0, 5)
  }));

const creatorIntentPattern = /\b(cam|webcam)\s*(model|performer)|become\s+(a\s+)?(cam|webcam)?\s*model|model\s+signup|start\s+camming|camming\s+(job|work)|cam\s+model\s+earnings/i;
const affiliateIntentPattern = /stripcash\s+affiliate|cam\s+affiliate|webcam\s+affiliate|adult\s+affiliate\s+program|webmaster\s+affiliate/i;
const commercialIntentPattern = /best|review|vs|versus|price|pricing|token|alternative|compare|signup|register|earnings|affiliate/i;
const syntheticPromptPattern = /\bcontext\s*:|\bquestion\s*:|do not include|not for language|location\s*:/i;
const genericKeywordPattern = /^(porn|free porn|porn videos?|adult|adult videos?|sex|sex videos?|xxx|live sex)$/i;
const adultDomainPattern = /\b(xhamster|xhampster|xhamter|f95zone|chaturbate|chaterbate|stripchat|bongacams?|livejasmin|camsoda|cam4|myfreecams|pornhub|xvideos|xnxx|onlyfans|fansly|manyvids|hentai|doujin|porn|xxx|adult|nude|sex toy|vibrator|hookup|camgirl|webcam model)\b/i;
const commercialLiveCamPattern = /\b(live cam|webcam)\s+(sites?|platforms?|models?|chat)\b/i;
const keywordSeedStopWords = new Set(['review', 'reviews', 'site', 'sites', 'overview', 'free', 'best', 'program', 'affiliate', 'adult', 'alternatives', 'alternative', 'live']);

function normalizeQuery(value) {
  return String(value || '')
    .replace(/#[rn]#/gi, ' ')
    .replace(/\+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesApprovedBrand(query) {
  const lower = String(query || '').toLowerCase();
  return [...approvedBrands].some((brand) => brand && lower.includes(brand));
}

function keywordExpansionEligibility(query, seed) {
  const normalized = normalizeQuery(query);
  const normalizedSeed = normalizeQuery(seed);
  if (!normalized || syntheticPromptPattern.test(query)) return { eligible: false, reason: 'noise' };
  if (genericKeywordPattern.test(normalized)) return { eligible: false, reason: 'too_broad' };
  if (normalized === normalizedSeed) return { eligible: true, reason: 'exact_seed' };
  if (normalizedSeed.includes('live cam sites') && /^live cams?$/.test(normalized)) {
    return { eligible: true, reason: 'canonical_live_cam_variant' };
  }
  if (adultDomainPattern.test(normalized) || commercialLiveCamPattern.test(normalized)) {
    return { eligible: true, reason: 'adult_domain_signal' };
  }
  const seedTokens = normalizedSeed.split(' ').filter((token) => token.length >= 4 && !keywordSeedStopWords.has(token));
  if (seedTokens.some((token) => normalized.includes(token))) {
    return { eligible: true, reason: 'specific_seed_overlap' };
  }
  const topic = topicFor(query);
  if (topic.state !== 'new') return { eligible: true, reason: 'known_content_topic' };
  return { eligible: false, reason: 'off_topic_related_keyword' };
}

function topicForKeywordExpansion(query, seeds = []) {
  const topic = topicFor(query);
  if (topic.state !== 'new') return topic;

  const normalized = normalizeQuery(query);
  const normalizedSeeds = seeds.map((seed) => normalizeQuery(seed));

  if (
    normalizedSeeds.some((seed) => seed.includes('xhamster')) &&
    /\bhamster\b|xxxhamster|exhamster/.test(normalized)
  ) {
    return {
      key: 'xhamster-review',
      label: 'xHamster review / site overview',
      page: '/xhamster',
      state: reviewSlugs.has('xhamster') ? 'review' : 'pending'
    };
  }

  if (
    normalizedSeeds.some((seed) => seed.includes('chaturbate alternatives')) &&
    /\bchaturbate\b|\bchaterbate\b/.test(normalized)
  ) {
    return {
      key: 'chaturbate-alternatives',
      label: 'Chaturbate alternatives',
      page: '/chaturbate-alternatives',
      state: routeExists('/chaturbate-alternatives') ? 'page' : 'new'
    };
  }

  if (
    normalizedSeeds.some((seed) => seed.includes('live cam sites')) &&
    /^live cams?$/.test(normalized)
  ) {
    return {
      key: 'best-live-cam-sites',
      label: 'Best live cam sites',
      page: '/best-live-cam-sites',
      state: routeExists('/best-live-cam-sites') ? 'page' : 'new'
    };
  }

  return topic;
}

function bingDateMs(value) {
  const raw = String(value || '');
  const match = raw.match(/\/Date\((\d+)\)\//);
  if (match) return Number(match[1]);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + Number(value || 0), 0) / values.length : 0;
}

function normalizedPath(value) {
  try {
    const parsed = new URL(String(value || ''), 'https://stripunion.com');
    return parsed.pathname.replace(/\/$/, '') || '/';
  } catch {
    const pathOnly = String(value || '').split('?')[0].replace(/\/$/, '');
    return pathOnly || '/';
  }
}

function numberByKeyPattern(row, patterns) {
  for (const [key, value] of Object.entries(row || {})) {
    const lower = key.toLowerCase();
    if (!patterns.some((pattern) => lower.includes(pattern))) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function routeExists(route) {
  const slug = String(route || '').split('/').filter(Boolean).at(-1)?.toLowerCase();
  return Boolean(slug && (staticRoutes.has(slug) || reviewSlugs.has(slug)));
}

function topicFor(rawQuery) {
  const query = normalizeQuery(rawQuery);

  if (
    /\bxhamster\b|\bxhampster\b|\bxhamter\b|\bxhasters\b|\bxhamsters\b|\bhamster com x\b/.test(query)
  ) {
    return {
      key: 'xhamster-review',
      label: 'xHamster review / site overview',
      page: '/xhamster',
      state: reviewSlugs.has('xhamster') ? 'review' : 'pending'
    };
  }

  if (/\bf95\s*zone\b|\bf95zone\b/.test(query)) {
    return {
      key: 'f95zone-review',
      label: 'F95Zone review',
      page: '/f95zone',
      state: reviewSlugs.has('f95zone') ? 'review' : 'pending'
    };
  }

  if (/\bstripchat\b/.test(query) && /alternative/.test(query)) {
    return {
      key: 'stripchat-alternatives',
      label: 'Stripchat alternatives',
      page: '/stripchat-alternatives',
      state: routeExists('/stripchat-alternatives') ? 'page' : 'new'
    };
  }

  if (/\bstripchat\b/.test(query) && /price|pricing|token|cost/.test(query)) {
    return {
      key: 'stripchat-pricing',
      label: 'Stripchat pricing / tokens',
      page: '/stripchat-pricing',
      state: routeExists('/stripchat-pricing') ? 'page' : 'new'
    };
  }

  if (/\bstripchat\b/.test(query) && /mobile|app|phone/.test(query)) {
    return {
      key: 'stripchat-mobile',
      label: 'Stripchat mobile experience',
      page: '/stripchat-app',
      state: routeExists('/stripchat-app') ? 'page' : 'new'
    };
  }

  if (/\bstripcash\b/.test(query) && /affiliate|webmaster/.test(query)) {
    return {
      key: 'stripcash-affiliate',
      label: 'StripCash affiliate program',
      page: '/stripcash-affiliate-program',
      state: routeExists('/stripcash-affiliate-program') ? 'page' : 'new'
    };
  }

  if (creatorIntentPattern.test(query)) {
    return {
      key: 'cam-model-signup',
      label: 'Become a cam model',
      page: '/become-a-cam-model',
      state: routeExists('/become-a-cam-model') ? 'page' : 'new'
    };
  }

  for (const review of Object.values({ ...reviews, ...vrReviews })) {
    const slug = normalizeQuery(review.slug);
    const name = normalizeQuery(review.name);
    if ((slug && query.includes(slug)) || (name && query.includes(name))) {
      return {
        key: `${review.slug}-review`,
        label: `${review.name} review`,
        page: `/${review.slug}`,
        state: 'review'
      };
    }
  }

  for (const [slug, [name]] of Object.entries(pendingReviews)) {
    const normalizedSlug = normalizeQuery(slug);
    const normalizedName = normalizeQuery(name);
    if ((normalizedSlug && query.includes(normalizedSlug)) || (normalizedName && query.includes(normalizedName))) {
      return {
        key: `${slug}-review`,
        label: `${name} review`,
        page: `/${slug}`,
        state: 'pending'
      };
    }
  }

  return {
    key: query,
    label: String(rawQuery || '').trim(),
    page: null,
    state: 'new'
  };
}

function classifyRecommendation({ topic, commercialIntent, approvedBrand, creatorIntent, affiliateIntent }) {
  if (topic.state === 'review' || topic.state === 'page') {
    return `refresh existing ${topic.page} landing page using clustered search evidence`;
  }
  if (topic.state === 'pending') {
    return `migrate pending ${topic.page} review into a substantive indexable page before adding any commercial CTA`;
  }
  if (creatorIntent) {
    return 'refresh the existing /become-a-cam-model creator funnel and route to the approved AVCams model signup';
  }
  if (affiliateIntent) {
    return 'refresh the existing /stripcash-affiliate-program webmaster funnel using the approved StripCash referral route';
  }
  if (approvedBrand) return 'evaluate an AVCams-conversion guide against the current content inventory';
  if (commercialIntent) return 'validate audience fit and an official monetization relationship before adding a commercial CTA';
  return 'evaluate a new on-site guide against the content inventory';
}

function addQuery({ sourceName, date, query, impressions, clicks, position, page }) {
  if (!query || impressions < 1) return;
  if (syntheticPromptPattern.test(query)) {
    droppedNoiseQueries += 1;
    return;
  }

  const normalized = normalizeQuery(query);
  if (!normalized) return;

  const topic = topicFor(query);
  const creatorIntent = creatorIntentPattern.test(normalized);
  const affiliateIntent = affiliateIntentPattern.test(normalized);
  const commercialIntent = commercialIntentPattern.test(normalized) || creatorIntent || affiliateIntent;
  const approvedBrand = matchesApprovedBrand(normalized);
  const monetizableIntent = creatorIntent || affiliateIntent || approvedBrand;

  const competitorEvidence = competitorChanges.map(({ urls, ...change }) => ({
    source: 'daily public sitemap diff',
    ...change,
    topicMatch: 'not established; treat as landscape context only'
  }));

  const existingEditorial = topic.state === 'review' || topic.state === 'page';
  const pendingEditorial = topic.state === 'pending';

  const score = Math.min(
    100,
    Math.round(
      Math.log2(impressions + 1) * 8 +
      (Number.isFinite(position) && 20 - position > 0 ? 20 - position : 0) +
      (commercialIntent ? 20 : 0) +
      (monetizableIntent ? 12 : 0) +
      (creatorIntent ? 8 : 0) +
      (existingEditorial ? 8 : 0) +
      (pendingEditorial ? 4 : 0) +
      (competitorEvidence.length ? 5 : 0)
    )
  );

  candidates.push({
    id: `${sourceName.toLowerCase()}-${Buffer.from(topic.key).toString('hex').slice(0, 20)}`,
    topicKey: topic.key,
    sourceEvidence: [{ source: sourceName, date, query, impressions, clicks, position }],
    targetKeyword: topic.label,
    recommendedAction: classifyRecommendation({
      topic,
      commercialIntent,
      approvedBrand,
      creatorIntent,
      affiliateIntent
    }),
    trafficIntent: impressions >= 20 ? 'high' : 'observed',
    commercialIntent: creatorIntent
      ? 'approved creator-referral intent'
      : affiliateIntent
        ? 'approved affiliate-referral intent'
        : commercialIntent
          ? (approvedBrand ? 'approved AVCams/StripCash intent' : 'commercial/review intent; monetization relationship not approved')
          : 'unknown',
    monetizationRoute: creatorIntent
      ? 'avcams-model-signup'
      : affiliateIntent
        ? 'stripcash-affiliate-referral'
        : approvedBrand
          ? 'avcams-viewer'
          : null,
    competitorEvidence,
    ourEvidence: {
      page: topic.page || page || null,
      contentState: topic.state,
      impressions,
      clicks,
      bestPosition: position,
      queryVariants: 1
    },
    expectedImpact: 'Potential visibility, click-through, conversion, or referral improvement; no forecast assigned.',
    confidence: impressions >= 20 ? 'medium' : 'low',
    risk: existingEditorial
      ? 'low'
      : pendingEditorial
        ? 'medium'
        : commercialIntent && !monetizableIntent
          ? 'high'
          : commercialIntent
            ? 'medium'
            : 'low',
    experimentWindow: '14 days',
    score
  });
}

for (const row of gsc?.data?.queryRows || []) {
  addQuery({
    sourceName: 'GSC',
    date: gsc.date,
    query: row.query,
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    position: Number(row.position || 99),
    page: row.page
  });
}

for (const site of bing?.data?.sites || []) {
  for (const row of site.queryStats || []) {
    addQuery({
      sourceName: 'Bing',
      date: row.Date,
      query: row.Query,
      impressions: Number(row.Impressions || 0),
      clicks: Number(row.Clicks || 0),
      position: Number(row.AvgImpressionPosition || 99)
    });
  }
}

let droppedIrrelevantKeywordExpansion = 0;
const keywordExpansionMap = new Map();
for (const seed of bing?.data?.keywordResearch?.bySeed || []) {
  for (const row of seed.related || []) {
    const query = String(row.Query || row.Keyword || row.RelatedKeyword || '').trim();
    const normalized = normalizeQuery(query);
    const eligibility = keywordExpansionEligibility(query, seed.seed);
    if (!normalized || !eligibility.eligible) {
      droppedIrrelevantKeywordExpansion += 1;
      continue;
    }
    const impressions = keywordImpressions(row);
    const existing = keywordExpansionMap.get(normalized) || {
      query,
      seeds: new Set(),
      reasons: new Set(),
      impressions: 0,
      source: 'Bing Webmaster Keyword Research'
    };
    existing.seeds.add(seed.seed);
    existing.reasons.add(eligibility.reason);
    existing.impressions += impressions;
    keywordExpansionMap.set(normalized, existing);
  }
}
const keywordExpansion = [...keywordExpansionMap.values()]
  .map((row) => {
    const topic = topicForKeywordExpansion(row.query, [...row.seeds]);
    return {
      ...row,
      seeds: [...row.seeds],
      relevanceReasons: [...row.reasons],
      reasons: undefined,
      topicState: topic.state,
      existingPage: topic.page,
      recommendedUse: topic.state === 'review' || topic.state === 'page'
        ? `refresh_existing:${topic.page}`
        : topic.state === 'pending'
          ? `migrate_pending:${topic.page}`
          : 'new_content_candidate'
    };
  })
  .sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))
  .slice(0, 40);

const risingKeywordSignals = (bing?.data?.keywordResearch?.bySeed || [])
  .map((seed) => {
    const rows = [...(seed.stats || [])]
      .filter((row) => Number(row.Impressions || 0) >= 0)
      .sort((a, b) => bingDateMs(a.Date) - bingDateMs(b.Date));
    if (rows.length < 4) return null;
    const windowSize = Math.min(3, Math.floor(rows.length / 2));
    const recent = rows.slice(-windowSize);
    const previous = rows.slice(-(windowSize * 2), -windowSize);
    const recentAverage = average(recent.map((row) => row.Impressions));
    const previousAverage = average(previous.map((row) => row.Impressions));
    const absoluteChange = recentAverage - previousAverage;
    const changeRatio = previousAverage > 0 ? recentAverage / previousAverage : (recentAverage > 0 ? null : 1);
    const trend = previousAverage > 0 && changeRatio >= 1.25 && absoluteChange >= 1
      ? 'rising'
      : previousAverage > 0 && changeRatio <= 0.75 && absoluteChange <= -1
        ? 'falling'
        : 'stable';
    return {
      query: seed.seed,
      trend,
      recentAverage: Number(recentAverage.toFixed(2)),
      previousAverage: Number(previousAverage.toFixed(2)),
      changeRatio: changeRatio == null ? null : Number(changeRatio.toFixed(2)),
      samples: rows.length,
      source: 'Bing GetKeywordStats'
    };
  })
  .filter(Boolean)
  .sort((a, b) => {
    const rank = { rising: 0, stable: 1, falling: 2 };
    return rank[a.trend] - rank[b.trend] || (b.changeRatio || 0) - (a.changeRatio || 0);
  });

const backlinkSiteRows = (bing?.data?.sites || []).map((site) => {
  const targets = (site.backlinkPages || [])
    .map((row) => ({
      url: row.Url || null,
      path: backlinkTarget(row.Url),
      inboundLinks: Number(row.Count || 0)
    }))
    .sort((a, b) => b.inboundLinks - a.inboundLinks);

  return {
    site: site.site,
    verified: site.verified === true,
    observedInboundLinks: targets.reduce((total, row) => total + row.inboundLinks, 0),
    linkedTargetPages: targets.length,
    referringSourceRows: (site.backlinkDetails || []).length,
    topTargets: targets.slice(0, 10)
  };
});
const authorityOpportunities = backlinkSiteRows.map((site) => ({
  site: site.site,
  status: site.observedInboundLinks > 0 ? 'build_on_existing_authority' : 'authority_gap',
  observedInboundLinks: site.observedInboundLinks,
  linkedTargetPages: site.linkedTargetPages,
  referringSourceRows: site.referringSourceRows,
  topTargets: site.topTargets,
  recommendedAction: site.observedInboundLinks > 0
    ? 'Prioritize earned links to commercially useful pages that already attract natural citations, while diversifying referring domains.'
    : 'Create link-worthy research/comparison assets and pursue legitimate partner/editorial citations; do not use paid link farms or bulk directory spam.'
}));

const gaLandingMap = new Map();
for (const row of ga4?.data?.rows || []) {
  const host = String(row.hostName || '').toLowerCase().replace(/^www\./, '');
  if (!['stripunion.com', 'blog.stripunion.com'].includes(host)) continue;
  const page = normalizedPath(row.landingPagePlusQueryString);
  const key = `${host}|${page}`;
  const current = gaLandingMap.get(key) || { host, page, sessions: 0, engagedSessions: 0 };
  current.sessions += Number(row.sessions || 0);
  current.engagedSessions += Number(row.engagedSessions || 0);
  gaLandingMap.set(key, current);
}
const gaClickMap = new Map();
for (const row of ga4?.data?.eventRows || []) {
  if (row.eventName !== 'affiliate_click') continue;
  const host = String(row.hostName || '').toLowerCase().replace(/^www\./, '');
  if (!['stripunion.com', 'blog.stripunion.com'].includes(host)) continue;
  const page = normalizedPath(row.pagePath);
  const key = `${host}|${page}`;
  gaClickMap.set(key, (gaClickMap.get(key) || 0) + Number(row.eventCount || 0));
}
const ctaOpportunities = [...gaLandingMap.entries()]
  .map(([key, row]) => {
    const affiliateClicks = Number(gaClickMap.get(key) || 0);
    const affiliateCtr = row.sessions ? affiliateClicks / row.sessions : null;
    return {
      ...row,
      affiliateClicks,
      affiliateCtr,
      engagementRate: row.sessions ? row.engagedSessions / row.sessions : null,
      recommendedAction: 'Review CTA visibility, internal-link context and offer alignment; change only through a measured 14-day experiment.',
      evidenceThreshold: 'Requires at least 20 sessions in the collected GA4 window.'
    };
  })
  .filter((row) => row.sessions >= 20 && (row.affiliateCtr == null || row.affiliateCtr < 0.02))
  .sort((a, b) => b.sessions - a.sessions)
  .slice(0, 12);

const clarityTraffic = new Map();
const clarityBehaviorMap = new Map();
for (const metric of clarity?.data?.metrics || []) {
  const metricName = String(metric.metricName || '');
  for (const row of metric.information || []) {
    const url = row.URL || row.Url || row.url || null;
    if (!url) continue;
    const pathName = normalizedPath(url);
    if (/traffic/i.test(metricName)) {
      const sessions = numberByKeyPattern(row, ['sessioncount', 'sessions']);
      if (sessions != null) clarityTraffic.set(pathName, Math.max(clarityTraffic.get(pathName) || 0, sessions));
      continue;
    }
    const patterns = /rage/i.test(metricName)
      ? ['rage']
      : /dead click/i.test(metricName)
        ? ['dead']
        : /quickback/i.test(metricName)
          ? ['quickback']
          : /excessive scroll/i.test(metricName)
            ? ['excessive']
            : /script error/i.test(metricName)
              ? ['script', 'error']
              : /error click/i.test(metricName)
                ? ['error', 'click']
                : null;
    if (!patterns) continue;
    const value = numberByKeyPattern(row, patterns);
    if (!(value > 0)) continue;
    const current = clarityBehaviorMap.get(pathName) || { page: pathName, signals: [], severity: 0 };
    current.signals.push({ metric: metricName, value });
    current.severity += value;
    clarityBehaviorMap.set(pathName, current);
  }
}
const behaviorOpportunities = [...clarityBehaviorMap.values()]
  .map((row) => ({
    ...row,
    sessions: clarityTraffic.get(row.page) ?? null,
    recommendedAction: 'Inspect the affected page in Clarity recordings/heatmaps, then test CTA or interaction changes rather than making an unmeasured redesign.'
  }))
  .sort((a, b) => b.severity - a.severity)
  .slice(0, 12);

const grouped = new Map();
for (const candidate of candidates) {
  const key = candidate.topicKey || normalizeQuery(candidate.targetKeyword);
  const old = grouped.get(key);
  if (!old) {
    grouped.set(key, candidate);
    continue;
  }

  old.sourceEvidence.push(...candidate.sourceEvidence);
  old.ourEvidence.impressions += candidate.ourEvidence.impressions;
  old.ourEvidence.clicks += candidate.ourEvidence.clicks;
  old.ourEvidence.queryVariants += 1;
  old.ourEvidence.bestPosition = Math.min(old.ourEvidence.bestPosition, candidate.ourEvidence.bestPosition);
  old.score = Math.min(
    100,
    Math.max(old.score, candidate.score) +
      Math.min(12, Math.round(Math.log2(old.ourEvidence.impressions + 1) * 2)) +
      Math.min(8, old.ourEvidence.queryVariants)
  );
  if (candidate.confidence === 'medium') old.confidence = 'medium';
}

const opportunities = [...grouped.values()]
  .sort((a, b) => b.score - a.score)
  .slice(0, 30)
  .map(({ score, topicKey, ...item }, index) => ({ ...item, rank: index + 1 }));

const stripcashMetrics = stripcash?.data?.metrics || {};
const monetization = stripcash
  ? {
      connected: true,
      date: stripcash.date,
      scope: stripcash.data.reportScope || 'API default aggregate scope',
      signups: Number(stripcashMetrics.signup || 0),
      verifiedSignups: Number(stripcashMetrics.verifiedSignup || 0),
      purchases: Number(stripcashMetrics.purchasesCount || 0),
      totalEarnings: Number(stripcashMetrics.totalEarnings || 0),
      modelReferralEarnings: Number(stripcashMetrics.modelsReferralEarnings || 0),
      webmasterRegistrations: Number(stripcashMetrics.webmasterRegistration || 0),
      webmasterReferralEarnings: Number(stripcashMetrics.webmasterReferralEarnings || 0),
      attributionLimit: 'Aggregate StripCash metrics must not be assigned to an individual query without grouped Statistics data or postback-level joining.'
    }
  : {
      connected: false,
      attributionLimit: 'StripCash aggregate statistics snapshot is unavailable.'
    };

const date = new Date().toISOString().slice(0, 10);
const outDir = path.join(root, 'opportunities');
await fs.mkdir(outDir, { recursive: true });

const result = {
  generatedAt: new Date().toISOString(),
  sources: {
    gsc: gsc?.date || null,
    bing: bing?.date || null,
    ga4: ga4?.date || null,
    clarity: clarity?.date || null,
    attribution: attribution?.date || null,
    stripcash: stripcash?.date || null,
    competitorSnapshot: competitor?.date || null,
    competitorDiff: diff?.date || null,
    wordpressDrafts: {
      status: 'unavailable',
      reason: 'No authenticated WordPress draft listing tool or repository draft export is available in this workflow.'
    }
  },
  monetization,
  queryHygiene: {
    droppedSyntheticPromptQueries: droppedNoiseQueries,
    droppedIrrelevantKeywordExpansion,
    canonicalClusteringEnabled: true,
    purpose: 'Prevent malformed, off-topic, over-broad and synthetic prompt-like rows from crowding the ranked growth queue.'
  },
  keywordExpansion: {
    source: bing?.data?.keywordResearch ? 'Bing Webmaster Keyword Research' : null,
    country: bing?.data?.keywordResearch?.country || null,
    language: bing?.data?.keywordResearch?.language || null,
    risingKeywordSignals,
    rows: keywordExpansion
  },
  authorityOpportunities,
  ctaOpportunities,
  behaviorOpportunities,
  opportunities,
  guardrails: {
    highRiskActionsAutoImplemented: false,
    wordpressPublished: false,
    competitorBodiesStored: false,
    forecastGuarantees: false,
    aggregateRevenueAssignedToKeyword: false
  }
};

await fs.writeFile(path.join(outDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n');

const lines = [
  `# Daily Growth Opportunities — ${date}`,
  '',
  `Sources: GSC ${result.sources.gsc || 'missing'} · Bing ${result.sources.bing || 'missing'} · GA4 ${result.sources.ga4 || 'missing'} · Clarity ${result.sources.clarity || 'pending'} · Attribution ${result.sources.attribution || 'missing'} · StripCash ${result.sources.stripcash || 'missing'} · competitor snapshot ${result.sources.competitorSnapshot || 'missing'} · diff ${result.sources.competitorDiff || 'missing'}.`,
  '',
  `Query hygiene: canonical clustering enabled · synthetic/prompt-like rows dropped: ${droppedNoiseQueries} · off-topic/broad Bing expansion rows dropped: ${droppedIrrelevantKeywordExpansion}.`,
  '',
  'WordPress draft inventory: unavailable in this run; no draft rows or publish-ready count are inferred.',
  '',
  monetization.connected
    ? `StripCash aggregate funnel connected: ${monetization.signups} signups · ${monetization.verifiedSignups} verified · ${monetization.purchases} purchases · ${monetization.totalEarnings} total earnings · ${monetization.modelReferralEarnings} model-referral earnings · ${monetization.webmasterReferralEarnings} affiliate-referral earnings. These aggregate values are not assigned to individual queries.`
    : 'StripCash aggregate funnel snapshot is unavailable.',
  '',
  '## Keyword expansion from Bing',
  '',
  ...(keywordExpansion.length
    ? keywordExpansion.slice(0, 15).map((row, index) =>
        `${index + 1}. **${row.query}** — ${row.impressions} Bing keyword-research impressions signal; seed(s): ${row.seeds.join(', ')}; use: ${row.recommendedUse}.`
      )
    : ['No relevant Bing related-keyword rows are available yet.']),
  '',
  '## Rising keyword signals',
  '',
  ...(risingKeywordSignals.length
    ? risingKeywordSignals.slice(0, 10).map((row) =>
        `- **${row.query}** — ${row.trend}; recent avg ${row.recentAverage}, previous avg ${row.previousAverage}, ratio ${row.changeRatio ?? 'n/a'} across ${row.samples} samples.`
      )
    : ['No Bing keyword trend series has enough samples yet.']),
  '',
  '## Authority / backlink opportunities',
  '',
  ...authorityOpportunities.map((row) =>
    `- **${row.site}** — ${row.observedInboundLinks} observed inbound links across ${row.linkedTargetPages} linked target page(s); ${row.recommendedAction}`
  ),
  '',
  '## CTA / conversion opportunities',
  '',
  ...(ctaOpportunities.length
    ? ctaOpportunities.map((row) =>
        `- **${row.host}${row.page}** — ${row.sessions} sessions · ${row.affiliateClicks} affiliate clicks · CTR ${row.affiliateCtr == null ? 'n/a' : (row.affiliateCtr * 100).toFixed(1) + '%'}; ${row.recommendedAction}`
      )
    : ['No page has enough GA4 sample size to justify an automated CTA experiment yet.']),
  '',
  '## Clarity behavior opportunities',
  '',
  ...(behaviorOpportunities.length
    ? behaviorOpportunities.map((row) =>
        `- **${row.page}** — ${row.signals.map((signal) => `${signal.metric}=${signal.value}`).join(', ')}; sessions ${row.sessions ?? 'n/a'}; ${row.recommendedAction}`
      )
    : [clarity ? 'No actionable Clarity friction signals were found in the latest export.' : 'Clarity Data Export is not connected yet; in-browser tracking can still be active.']),
  '',
  '## Ranked evidence-backed opportunities',
  ''
];

for (const opportunity of opportunities) {
  lines.push(
    `${opportunity.rank}. **${opportunity.targetKeyword}** — ${opportunity.recommendedAction}; ${opportunity.ourEvidence.impressions} clustered impressions, ${opportunity.ourEvidence.clicks} clicks, best position ${opportunity.ourEvidence.bestPosition}, ${opportunity.ourEvidence.queryVariants} query variant(s); intent ${opportunity.commercialIntent}; route ${opportunity.monetizationRoute || 'none'}; confidence ${opportunity.confidence}; risk ${opportunity.risk}.`
  );
}

if (!opportunities.length) {
  lines.push('No query-level opportunities met the minimum observed-data threshold.');
}

await fs.writeFile(path.join(outDir, 'latest.md'), lines.join('\n') + '\n');
console.log(`Opportunity report generated: ${opportunities.length} clustered candidates; keyword expansion=${keywordExpansion.length}; rising keywords=${risingKeywordSignals.length}; CTA opportunities=${ctaOpportunities.length}; Clarity behavior opportunities=${behaviorOpportunities.length}; authority sites=${authorityOpportunities.length}; dropped noise=${droppedNoiseQueries}; dropped irrelevant expansion=${droppedIrrelevantKeywordExpansion}; StripCash aggregate connected=${monetization.connected}.`);
