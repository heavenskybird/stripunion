import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviews } from '../../src/data/reviews.js';
import { vrReviews } from '../../src/data/reviews-vr.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pageDir = path.join(repo, 'src/pages');
const dataDir = path.join(repo, 'ops/growth/content-inventory');
const excludedStaticFiles = new Set([
  '404.astro',
  '[slug].astro',
  'affiliate-disclosure.astro',
  'age-verification.astro',
  'contact.astro',
  'disclaimer.astro',
  'editorial-policy.astro',
  'privacy-policy.astro',
  'terms.astro'
]);

const files = (await fs.readdir(pageDir))
  .filter((name) => name.endsWith('.astro') && !excludedStaticFiles.has(name))
  .sort();

const gscRoot = path.join(repo, 'ops/seo-data-layer/data/raw');
const dirs = (await fs.readdir(gscRoot).catch(() => []))
  .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
  .sort()
  .reverse();

let gsc = null;
for (const dir of dirs) {
  try {
    gsc = JSON.parse(await fs.readFile(path.join(gscRoot, dir, 'gsc.json'), 'utf8'));
    break;
  } catch {}
}

let bing = null;
for (const dir of dirs) {
  try {
    bing = JSON.parse(await fs.readFile(path.join(gscRoot, dir, 'bing.json'), 'utf8'));
    break;
  } catch {}
}

const queryStats = new Map();
const addPageImpressions = (url, impressions) => {
  const key = String(url || '').toLowerCase().split('/').filter(Boolean).at(-1) || 'index';
  queryStats.set(key, (queryStats.get(key) || 0) + Number(impressions || 0));
};

for (const row of gsc?.data?.pageRows || gsc?.pageRows || []) {
  addPageImpressions(row.page, row.impressions);
}

for (const site of bing?.data?.sites || bing?.sites || []) {
  for (const row of site.pageStats || []) {
    addPageImpressions(row.Page || row.page, row.Impressions || row.impressions);
  }
}

const clusterOf = (text) =>
  /best.*(?:cam|site)|top.*cam/i.test(text) ? 'best cam sites'
  : /vs|versus/i.test(text) ? 'platform-vs-platform'
  : /pric|token|credit/i.test(text) ? 'pricing/tokens'
  : /payment|billing|wallet/i.test(text) ? 'payments'
  : /app|mobile|device|vr/i.test(text) ? 'mobile/device'
  : /\b(?:model|creator|work|earn)\b/i.test(text) ? 'creator/model referral'
  : /feature|search|private|magic/i.test(text) ? 'features'
  : /country|regional|region/i.test(text) ? 'regional'
  : /review/i.test(text) ? 'platform reviews'
  : 'guides';

const tokens = (value) => new Set(String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []);
const rows = [];

function similarityAgainstExisting(body) {
  const t = tokens(body);
  const similarities = rows.map((row) => {
    const u = tokens(row.body);
    let intersection = 0;
    for (const word of t) if (u.has(word)) intersection += 1;
    return t.size && u.size ? intersection / (t.size + u.size - intersection) : 0;
  });
  return similarities.length ? Math.max(...similarities) : 0;
}

function addInventoryRow({
  route,
  title,
  description,
  plain,
  headings,
  links,
  affiliateRelevance,
  freshnessSignal,
  candidateType,
  contentSource
}) {
  const routeKey = String(route || '').replace(/^\//, '').toLowerCase() || 'index';
  const words = plain.split(/\s+/).filter(Boolean).length;
  const commercial = /best|review|vs|alternative|price|pricing|token|compare/i.test(`${title} ${route}`) ? 5 : 2;
  const opportunity = Math.min(5, Math.round((queryStats.get(routeKey) || 0) / 10));
  const overlap = similarityAgainstExisting(plain);
  const internalLinks = Math.min(5, Math.floor(links / 2));
  const completeness = Math.min(
    5,
    (description ? 1 : 0) +
      (headings >= 3 ? 2 : headings ? 1 : 0) +
      (words >= 350 ? 1 : 0) +
      (links >= 3 ? 1 : 0)
  );
  const uniqueness = Math.max(0, 5 - Math.round(overlap * 5));
  const score = Math.round(
    commercial * 5 +
      opportunity * 4 +
      uniqueness * 3 +
      freshnessSignal * 2 +
      (5 - Math.round(overlap * 5)) * 2 +
      internalLinks * 2 +
      affiliateRelevance +
      completeness
  );

  rows.push({
    route,
    title,
    cluster: clusterOf(`${title} ${route}`),
    score,
    contentSource,
    scorecard: {
      commercialIntent: commercial,
      keywordOpportunity: opportunity,
      uniqueness,
      freshnessSignal,
      overlapRisk: Number(overlap.toFixed(2)),
      internalLinkPotential: internalLinks,
      affiliateRelevance,
      contentCompleteness: completeness
    },
    signals: {
      wordCount: words,
      headings,
      links,
      queryImpressions: queryStats.get(routeKey) || 0
    },
    candidateType,
    qualityGate:
      words >= 300 && headings >= 2 && description.length >= 45 && overlap < 0.72
        ? 'review-ready'
        : 'needs editorial review',
    body: plain
  });
}

for (const file of files) {
  const body = await fs.readFile(path.join(pageDir, file), 'utf8');
  const route = file.replace(/\.astro$/, '');
  const title =
    body.match(/(?:const title\s*=\s*|<title>)(['"`])([\s\S]*?)\1/)?.[2] ||
    body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ').trim() ||
    route;
  const description = body.match(/const description\s*=\s*(['"])([\s\S]*?)\1/)?.[2] || '';
  const plain = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const headings = (body.match(/<h2\b/gi) || []).length;
  const links = (body.match(/href\s*=/gi) || []).length;
  const affiliateRelevance = /AffiliateButton|StripCashReferralButton|AffiliateCTA/.test(body)
    ? 5
    : /affiliate/i.test(body)
      ? 2
      : 0;
  const freshnessSignal = /2026|updated|checked|verified/i.test(body) ? 4 : 2;

  addInventoryRow({
    route: `/${route}`,
    title,
    description,
    plain,
    headings,
    links,
    affiliateRelevance,
    freshnessSignal,
    candidateType: 'update existing Astro page',
    contentSource: 'astro-page'
  });
}

for (const review of Object.values({ ...reviews, ...vrReviews })) {
  if (!review?.indexable) continue;

  const sectionText = (review.sections || []).flat().join(' ');
  const faqText = (review.faq || []).flat().join(' ');
  const strengths = (review.strengths || []).join(' ');
  const limitations = (review.limitations || []).join(' ');
  const relatedText = (review.relatedLinks || []).flat().join(' ');
  const plain = [
    review.title,
    review.description,
    review.dek,
    review.verdict,
    review.bestFor,
    review.access,
    review.model,
    strengths,
    limitations,
    sectionText,
    faqText,
    relatedText
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const headings = (review.sections?.length || 0) + (review.faq?.length ? 1 : 0);
  const links = review.relatedLinks?.length || 0;
  const affiliateRelevance = review.partner ? 5 : /AVCams/i.test(relatedText) ? 2 : 0;
  const freshnessSignal = /2026|updated|checked|verified/i.test(`${review.title} ${plain}`) ? 4 : 2;

  addInventoryRow({
    route: `/${review.slug}`,
    title: review.title,
    description: review.description || '',
    plain,
    headings,
    links,
    affiliateRelevance,
    freshnessSignal,
    candidateType: 'update data-driven review',
    contentSource: 'review-data'
  });
}

rows.sort((a, b) => b.score - a.score);
const reviewDataCount = rows.filter((row) => row.contentSource === 'review-data').length;
const astroPageCount = rows.filter((row) => row.contentSource === 'astro-page').length;

const result = {
  generatedAt: new Date().toISOString(),
  scope: 'tracked Astro pages plus indexable data-driven reviews; WordPress draft inventory remains separate',
  sources: {
    gsc: gsc?.collectedAt || null,
    bing: bing?.collectedAt || null,
    wordpressDrafts: {
      status: 'unavailable',
      reason: 'No authenticated WordPress draft-listing connector or repository export is available.'
    }
  },
  inventorySize: rows.length,
  inventoryBreakdown: {
    astroPages: astroPageCount,
    dataDrivenReviews: reviewDataCount
  },
  wordpressDraftCount: null,
  publishReadyDraftCount: null,
  updateCandidates: rows.slice(0, 30).map(({ body, ...row }, index) => ({ ...row, rank: index + 1 })),
  pages: rows.map(({ body, ...row }) => row)
};

await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(path.join(dataDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
console.log(
  `Content inventory: ${rows.length} total pages (${astroPageCount} Astro + ${reviewDataCount} data-driven reviews); WordPress drafts unavailable; ${result.updateCandidates.filter((row) => row.qualityGate === 'review-ready').length} candidates meet the preliminary review gate.`
);
