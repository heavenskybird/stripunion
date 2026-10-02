import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const [gsc, bing, stripcash, competitor, diff] = await Promise.all([
  source('gsc.json'),
  source('bing.json'),
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
const existing = new Set(pageFiles.map((file) => file.replace(/\.astro$/, '').toLowerCase()));

const candidates = [];
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

function matchesApprovedBrand(query) {
  const lower = String(query || '').toLowerCase();
  return [...approvedBrands].some((brand) => brand && lower.includes(brand));
}

function existingPageFor(page) {
  return existing.has(String(page || '').split('/').filter(Boolean).at(-1)?.toLowerCase());
}

function classifyRecommendation({ query, page, commercialIntent, approvedBrand, creatorIntent, affiliateIntent }) {
  if (existingPageFor(page)) return 'refresh existing landing page using current search evidence';
  if (creatorIntent) return 'evaluate a creator-acquisition guide that routes to the approved AVCams model signup';
  if (affiliateIntent) return 'evaluate an affiliate/webmaster guide using the approved StripCash referral route';
  if (approvedBrand) return 'evaluate an AVCams-conversion guide against the current content inventory';
  if (commercialIntent) return 'validate audience fit and an official monetization relationship before adding a commercial CTA';
  return 'evaluate a new on-site guide against the content inventory';
}

function addQuery({ sourceName, date, query, impressions, clicks, position, page }) {
  if (!query || impressions < 1) return;

  const creatorIntent = creatorIntentPattern.test(query);
  const affiliateIntent = affiliateIntentPattern.test(query);
  const commercialIntent = commercialIntentPattern.test(query) || creatorIntent || affiliateIntent;
  const approvedBrand = matchesApprovedBrand(query);
  const monetizableIntent = creatorIntent || affiliateIntent || approvedBrand;

  const competitorEvidence = competitorChanges.map(({ urls, ...change }) => ({
    source: 'daily public sitemap diff',
    ...change,
    topicMatch: 'not established; treat as landscape context only'
  }));

  const score = Math.min(
    100,
    Math.round(
      Math.log2(impressions + 1) * 8 +
      (Number.isFinite(position) && 20 - position > 0 ? 20 - position : 0) +
      (commercialIntent ? 20 : 0) +
      (monetizableIntent ? 12 : 0) +
      (creatorIntent ? 8 : 0) +
      (competitorEvidence.length ? 5 : 0)
    )
  );

  candidates.push({
    id: `${sourceName.toLowerCase()}-${Buffer.from(query).toString('hex').slice(0, 16)}`,
    sourceEvidence: [{ source: sourceName, date, query, impressions, clicks, position }],
    targetKeyword: query,
    recommendedAction: classifyRecommendation({
      query,
      page,
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
    ourEvidence: { page: page || null, impressions, clicks, position },
    expectedImpact: 'Potential visibility, click-through, conversion, or referral improvement; no forecast assigned.',
    confidence: impressions >= 20 ? 'medium' : 'low',
    risk: commercialIntent && !monetizableIntent ? 'high' : commercialIntent ? 'medium' : 'low',
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

const grouped = new Map();
for (const candidate of candidates) {
  const key = candidate.targetKeyword.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const old = grouped.get(key);
  if (!old) {
    grouped.set(key, candidate);
  } else {
    old.sourceEvidence.push(...candidate.sourceEvidence);
    old.score = Math.min(100, Math.max(old.score, candidate.score) + 4);
    old.ourEvidence.impressions += candidate.ourEvidence.impressions;
    old.ourEvidence.clicks += candidate.ourEvidence.clicks;
  }
}

const opportunities = [...grouped.values()]
  .sort((a, b) => b.score - a.score)
  .slice(0, 30)
  .map(({ score, ...item }, index) => ({ ...item, rank: index + 1 }));

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
    stripcash: stripcash?.date || null,
    competitorSnapshot: competitor?.date || null,
    competitorDiff: diff?.date || null,
    wordpressDrafts: {
      status: 'unavailable',
      reason: 'No authenticated WordPress draft listing tool or repository draft export is available in this workflow.'
    }
  },
  monetization,
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
  `Sources: GSC ${result.sources.gsc || 'missing'} · Bing ${result.sources.bing || 'missing'} · StripCash ${result.sources.stripcash || 'missing'} · competitor snapshot ${result.sources.competitorSnapshot || 'missing'} · diff ${result.sources.competitorDiff || 'missing'}.`,
  '',
  'WordPress draft inventory: unavailable in this run; no draft rows or publish-ready count are inferred.',
  '',
  monetization.connected
    ? `StripCash aggregate funnel connected: ${monetization.signups} signups · ${monetization.verifiedSignups} verified · ${monetization.purchases} purchases · ${monetization.totalEarnings} total earnings · ${monetization.modelReferralEarnings} model-referral earnings · ${monetization.webmasterReferralEarnings} affiliate-referral earnings. These aggregate values are not assigned to individual queries.`
    : 'StripCash aggregate funnel snapshot is unavailable.',
  '',
  '## Ranked evidence-backed opportunities',
  ''
];

for (const opportunity of opportunities) {
  lines.push(
    `${opportunity.rank}. **${opportunity.targetKeyword}** — ${opportunity.recommendedAction}; ${opportunity.sourceEvidence[0].impressions} impressions, ${opportunity.sourceEvidence[0].clicks} clicks, position ${opportunity.sourceEvidence[0].position}; intent ${opportunity.commercialIntent}; route ${opportunity.monetizationRoute || 'none'}; confidence ${opportunity.confidence}; risk ${opportunity.risk}.`
  );
}

if (!opportunities.length) {
  lines.push('No query-level opportunities met the minimum observed-data threshold.');
}

await fs.writeFile(path.join(outDir, 'latest.md'), lines.join('\n') + '\n');
console.log(`Opportunity report generated: ${opportunities.length} evidence-backed candidates; StripCash aggregate connected=${monetization.connected}.`);
