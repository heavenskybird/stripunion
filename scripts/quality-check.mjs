import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'public'];
const textExtensions = new Set(['.astro', '.js', '.mjs', '.css', '.txt', '.svg']);
const forbidden = [
  ['legacy affiliate domain', 'go.mavrtracktor.com'],
  ['Hostinger placeholder', 'Write a short description of this category'],
  ['Hostinger placeholder', 'Write a short text about your service'],
  ['Hostinger placeholder', 'Predict the future'],
  ['fake phone', '123-123-1234'],
  ['fake email', 'info@email.com'],
  ['fake address', '3721 Single Street']
];

const approvedAffiliateUserId =
  '103b9c78aec8b8b06d334ded4b9d5ae3c0c8add13eea35b59fc519455ece9fe2';

const allowedExternalPrefixes = [
  'https://schema.org',
  'https://stripunion.com',
  'https://blog.stripunion.com',
  'https://avcams.online',
  'https://go.whitetrafsa.com',
  'https://stripcash.com',
  'https://stripunion-live-models.stripunion.workers.dev',
  'https://www.googletagmanager.com'
];

const files = [];
for (const root of roots) walk(root);

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) walk(path.join(target, name));
    return;
  }
  if (textExtensions.has(path.extname(target))) files.push(target);
}

let failed = false;

const repetitiveDisclosurePhrases = [
  'Affiliate disclosure:',
  'StripUnion may earn commissions from qualifying referrals.',
  'StripUnion may earn a commission from qualifying referrals'
];

for (const file of files) {
  if (file !== 'src/pages/affiliate-disclosure.astro') {
    const content = fs.readFileSync(file, 'utf8');
    for (const phrase of repetitiveDisclosurePhrases) {
      if (content.includes(phrase)) {
        failed = true;
        console.error(`FAIL: repetitive affiliate-disclosure copy found in ${file}: ${phrase}`);
      }
    }
  }
}

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');

  for (const [label, needle] of forbidden) {
    if (content.includes(needle)) {
      failed = true;
      console.error(`FAIL: ${label} found in ${file}: ${needle}`);
    }
  }

  const urls = content.match(/https:\/\/[^'"\`\s<>)]+/g) || [];
  for (const url of urls) {
    if (!allowedExternalPrefixes.some((prefix) => url.startsWith(prefix))) {
      failed = true;
      console.error(`FAIL: non-approved external URL found in user-facing source: ${file}: ${url}`);
    }
  }
}

const siteConfig = fs.readFileSync('src/config/site.js', 'utf8');
for (const [label, required] of [
  ['StripCash tracking host', "STRIPCASH_TRACKING_URL = 'https://go.whitetrafsa.com/'"],
  ['StripCash affiliate userId', approvedAffiliateUserId],
  ['StripCash source attribution ID', "STRIPCASH_SOURCE_ID = 'stripunion'"],
  ['AVCams target domain', "domain: 'avcams.online'"],
  ['AVCams default path', "defaultPath: '/girls'"]
]) {
  if (!siteConfig.includes(required)) {
    failed = true;
    console.error(`FAIL: ${label} is missing or changed unexpectedly in src/config/site.js`);
  }
}

if (siteConfig.includes('STRIPCHAT_AFFILIATE_URL')) {
  failed = true;
  console.error('FAIL: legacy STRIPCHAT_AFFILIATE_URL should not remain in src/config/site.js');
}

const affiliateButton = fs.readFileSync('src/components/AffiliateButton.astro', 'utf8');
if (/Paid link|paid-link-note/i.test(affiliateButton)) {
  failed = true;
  console.error('FAIL: affiliate CTA still renders a paid-link note.');
}

if (!affiliateButton.includes('buildAvcamsUrl({')) {
  failed = true;
  console.error('FAIL: AffiliateButton is not using the centralized AVCams/StripCash URL builder.');
}

for (const required of [
  'data-stripcash-campaign-id',
  'data-stripcash-creative-id',
  'data-stripcash-source-id',
  'data-stripcash-p1',
  'data-stripcash-p2',
  'data-avcams-target-domain',
  'data-avcams-path'
]) {
  if (!affiliateButton.includes(required)) {
    failed = true;
    console.error(`FAIL: AffiliateButton is missing required Stripcash attribution field: ${required}`);
  }
}

const affiliateLib = fs.readFileSync('src/lib/affiliate.js', 'utf8');
for (const required of ['userId', 'campaignId', 'creativeId', 'sourceId', "'p1'", "'p2'", 'targetDomain', "'path'"]) {
  if (!affiliateLib.includes(required)) {
    failed = true;
    console.error(`FAIL: Stripcash URL builder is missing parameter support: ${required}`);
  }
}

const bestLiveCamPage = fs.readFileSync('src/pages/best-live-cam-sites.astro', 'utf8');
for (const required of ['FAQPage', 'Compare the spending model before buying tokens or credits', 'Mobile experience matters more than a separate app']) {
  if (!bestLiveCamPage.includes(required)) {
    failed = true;
    console.error(`FAIL: best-live-cam intent page is missing depth/FAQ content: ${required}`);
  }
}

const stripchatAlternativesPage = fs.readFileSync('src/pages/stripchat-alternatives.astro', 'utf8');
for (const required of ['FAQPage', 'If discovery is the problem', 'If spending or token value is the problem', 'If mobile use is the problem']) {
  if (!stripchatAlternativesPage.includes(required)) {
    failed = true;
    console.error(`FAIL: Stripchat alternatives intent page is missing depth/FAQ content: ${required}`);
  }
}

const liveNowCommercialPages = [
  ['src/pages/index.astro', 'homepage_live_now'],
  ['src/pages/best-live-cam-sites.astro', 'best_live_cam_sites_live_now'],
  ['src/pages/best-free-live-cam-sites.astro', 'best_free_live_cams_live_now'],
  ['src/pages/stripchat-alternatives.astro', 'stripchat_alternatives_live_now'],
  ['src/pages/stripchat-pricing.astro', 'stripchat_pricing_live_now']
];
for (const [file, source] of liveNowCommercialPages) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('LiveModelsGrid') || !content.includes(source)) {
    failed = true;
    console.error(`FAIL: commercial page is missing attributed Live Now discovery: ${file}`);
  }
}

const liveModelsComponent = fs.readFileSync('src/components/LiveModelsGrid.astro', 'utf8');
for (const required of ['PUBLIC_LIVE_MODELS_API_URL', 'https://stripunion-live-models.stripunion.workers.dev/models', 'data-live-source', 'data-live-p1', 'data-live-limit', 'live_models_loaded', 'live_models_unavailable', 'targetDomain', 'search/magic-search']) {
  if (!liveModelsComponent.includes(required)) {
    failed = true;
    console.error(`FAIL: LiveModelsGrid is missing required AVCams live-discovery state: ${required}`);
  }
}
if (liveModelsComponent.includes('STRIPCASH_MODELS_API_KEY')) {
  failed = true;
  console.error('FAIL: StripCash Models API key name must not appear in browser-facing LiveModelsGrid code.');
}

const liveModelsWorker = fs.readFileSync('services/live-models-worker/src/index.js', 'utf8');
for (const required of ['ModelsCatalog', 'MIN_UPSTREAM_INTERVAL_MS = 10_000', 'blockedCountries', 'blockedRegions', 'blockedLanguages', 'setAlarm', 'MAX_STORED_MODELS = 500']) {
  if (!liveModelsWorker.includes(required)) {
    failed = true;
    console.error(`FAIL: live models worker is missing a required compliance/control marker: ${required}`);
  }
}

const avcamsPage = fs.readFileSync('src/pages/avcams.astro', 'utf8');
for (const required of ['AVCams', 'LiveModelsGrid', 'destinationPath="/signup/model"', '/search/magic-search/', 'avcams_search_cosplay', 'avcams_search_gaming', 'avcams_search_natural', 'avcams_search_office']) {
  if (!avcamsPage.includes(required)) {
    failed = true;
    console.error(`FAIL: first-class AVCams landing page is missing required content: ${required}`);
  }
}

for (const forbiddenCopy of ['white-label', 'white label', 'branded StripCash', 'underlying Stripchat infrastructure', 'StripCash/Stripchat infrastructure']) {
  if (avcamsPage.toLowerCase().includes(forbiddenCopy.toLowerCase())) {
    failed = true;
    console.error(`FAIL: AVCams page exposes implementation/white-label wording: ${forbiddenCopy}`);
  }
}

const userFacingPages = files.filter((file) => file.startsWith('src/pages/') || file.startsWith('src/components/'));
const stripchatNamedAffiliateCta = /<AffiliateButton\b[^>]*label=["'][^"']*Stripchat[^"']*["'][^>]*\/>/i;
for (const file of userFacingPages) {
  const content = fs.readFileSync(file, 'utf8');
  if (stripchatNamedAffiliateCta.test(content)) {
    failed = true;
    console.error(`FAIL: AffiliateButton label names Stripchat even though the centralized destination is AVCams: ${file}`);
  }
}
for (const file of userFacingPages) {
  const content = fs.readFileSync(file, 'utf8');
  for (const forbiddenCopy of ['branded StripCash white-label', 'branded StripCash', 'underlying Stripchat infrastructure', 'StripCash/Stripchat infrastructure']) {
    if (content.toLowerCase().includes(forbiddenCopy.toLowerCase())) {
      failed = true;
      console.error(`FAIL: user-facing implementation wording found in ${file}: ${forbiddenCopy}`);
    }
  }
}

const referralButton = fs.readFileSync('src/components/StripCashReferralButton.astro', 'utf8');
for (const required of ['STRIPCASH_AFFILIATE_REFERRAL_URL', 'data-affiliate-partner="stripcash_referral"', 'data-affiliate-mode="direct-referral"']) {
  if (!referralButton.includes(required)) {
    failed = true;
    console.error(`FAIL: StripCash referral button is missing required state: ${required}`);
  }
}

const referralPage = fs.readFileSync('src/pages/stripcash-affiliate-program.astro', 'utf8');
for (const required of ['StripCash affiliate-referral guide', '5% lifetime share', 'No income guarantee']) {
  if (!referralPage.includes(required)) {
    failed = true;
    console.error(`FAIL: StripCash affiliate funnel is missing required content: ${required}`);
  }
}

const creatorPage = fs.readFileSync('src/pages/become-a-cam-model.astro', 'utf8');
for (const required of ['Become a cam model on AVCams', 'destinationPath="/signup/model"', 'No guarantees']) {
  if (!creatorPage.includes(required)) {
    failed = true;
    console.error(`FAIL: creator acquisition page is missing required content: ${required}`);
  }
}

const weeklyReport = fs.readFileSync('ops/seo-data-layer/src/reports/weekly.mjs', 'utf8');
for (const required of ['growthOpportunities', 'contentInventory', 'clusteredOpportunities', 'syntheticPromptPattern', 'tracked main-site pages']) {
  if (!weeklyReport.includes(required)) {
    failed = true;
    console.error(`FAIL: weekly report cleaned growth signal integration is missing: ${required}`);
  }
}

const contentInventory = fs.readFileSync('ops/growth/content-inventory.mjs', 'utf8');
for (const required of ["from '../../src/data/reviews.js'", "from '../../src/data/reviews-vr.js'", "contentSource: 'review-data'", "inventoryBreakdown"]) {
  if (!contentInventory.includes(required)) {
    failed = true;
    console.error(`FAIL: dynamic review content inventory is missing: ${required}`);
  }
}

const opportunityEngine = fs.readFileSync('ops/growth/opportunities.mjs', 'utf8');
for (const required of ['syntheticPromptPattern', 'topicFor(rawQuery)', 'Object.entries(pendingReviews)', 'canonicalClusteringEnabled', 'droppedSyntheticPromptQueries']) {
  if (!opportunityEngine.includes(required)) {
    failed = true;
    console.error(`FAIL: growth opportunity query hygiene is missing: ${required}`);
  }
}

const legacyData = fs.readFileSync('src/data/legacy.js', 'utf8');
for (const migratedSlug of ['xhamster', 'f95zone']) {
  const pendingPattern = new RegExp('^\\s*' + migratedSlug + ':\\s*\\[', 'm');
  if (pendingPattern.test(legacyData)) {
    failed = true;
    console.error(`FAIL: ${migratedSlug} remains in the pending-review queue after migration.`);
  }
}

const reviewsData = fs.readFileSync('src/data/reviews.js', 'utf8');
for (const required of ["slug: 'xhamster'", "title: 'xHamster Review 2026: Site Overview, Features, Pros & Cons'", "partner: false", "indexable: true"]) {
  if (!reviewsData.includes(required)) {
    failed = true;
    console.error(`FAIL: xHamster search-capture review is missing required state: ${required}`);
  }
}
for (const required of ["slug: 'f95zone'", "title: 'F95Zone Review 2026: Adult Games, Visual Novels & Community'", "partner: false", "indexable: true"]) {
  if (!reviewsData.includes(required)) {
    failed = true;
    console.error(`FAIL: F95Zone search-capture review is missing required state: ${required}`);
  }
}

const sitemap = fs.readFileSync('src/pages/sitemap.xml.js', 'utf8');
for (const route of ["'/avcams'", "'/become-a-cam-model'", "'/stripcash-affiliate-program'"]) {
  if (!sitemap.includes(route)) {
    failed = true;
    console.error(`FAIL: required monetization route is missing from the sitemap: ${route}`);
  }
}

const baseLayout = fs.readFileSync('src/layouts/BaseLayout.astro', 'utf8');
if (!baseLayout.includes('<a href="/avcams">AVCams</a>')) {
  failed = true;
  console.error('FAIL: AVCams is not present in primary navigation.');
}

if (!baseLayout.includes('<a href="/become-a-cam-model">Become a Model</a>')) {
  failed = true;
  console.error('FAIL: creator funnel is not linked from the site chrome.');
}

if (!baseLayout.includes('<a href="/stripcash-affiliate-program">For Affiliates</a>')) {
  failed = true;
  console.error('FAIL: StripCash affiliate funnel is not linked from the site chrome.');
}

if (!baseLayout.includes("const isAvcams = partner === 'avcams'")) {
  failed = true;
  console.error('FAIL: affiliate click analytics does not distinguish AVCams tracking from direct referral links.');
}

for (const required of ['memberId', 'crypto.randomUUID', 'stripcash_member_id', 'avcams_target_domain', 'avcams_path']) {
  if (!baseLayout.includes(required)) {
    failed = true;
    console.error(`FAIL: AVCams click/postback attribution is missing from BaseLayout: ${required}`);
  }
}

if (failed) process.exit(1);
console.log(`Quality gate passed across ${files.length} source/public files.`);
