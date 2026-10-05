import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const opportunitiesPath = path.join(root, 'ops/growth/opportunities/latest.json');
const offersPath = path.join(root, 'ops/growth/offers/direct-offers.json');
const outDir = path.join(root, 'ops/growth/decisions');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function actionFor(opportunity) {
  const state = String(opportunity?.ourEvidence?.contentState || 'new');
  const risk = String(opportunity?.risk || 'low');

  if (risk === 'high') return 'HOLD';
  if (state === 'review' || state === 'page') return 'UPDATE';
  if (state === 'pending') return 'MIGRATE';
  return 'CREATE';
}

function opportunityPriority(opportunity) {
  const rank = Math.max(1, Number(opportunity?.rank || 30));
  const impressions = Number(opportunity?.ourEvidence?.impressions || 0);
  const position = Number(opportunity?.ourEvidence?.bestPosition || 99);
  const risk = String(opportunity?.risk || 'low');
  const confidence = String(opportunity?.confidence || 'low');
  let score = 102 - rank * 3;
  score += Math.min(18, Math.log2(impressions + 1) * 3);
  if (position >= 4 && position <= 20) score += 10;
  if (opportunity?.monetizationRoute) score += 8;
  if (confidence === 'medium') score += 5;
  if (risk === 'medium') score -= 8;
  if (risk === 'high') score -= 30;
  return Math.round(clamp(score));
}

function ctaPriority(row) {
  const sessions = Number(row?.sessions || 0);
  const ctr = Number.isFinite(Number(row?.affiliateCtr)) ? Number(row.affiliateCtr) : 0;
  return Math.round(clamp(45 + Math.log2(sessions + 1) * 7 + Math.max(0, 0.02 - ctr) * 500));
}

function behaviorPriority(row) {
  const severity = Number(row?.severity || 0);
  const sessions = Number(row?.sessions || 0);
  return Math.round(clamp(35 + Math.log2(severity + 1) * 12 + Math.log2(sessions + 1) * 3));
}

function safeOfferIds(offers) {
  return (offers?.offers || [])
    .filter((offer) => ['active', 'underlying_operator'].includes(String(offer?.status || '')))
    .map((offer) => offer.id)
    .filter(Boolean);
}

function selfTest() {
  const create = actionFor({ risk: 'low', ourEvidence: { contentState: 'new' } });
  const update = actionFor({ risk: 'low', ourEvidence: { contentState: 'page' } });
  const hold = actionFor({ risk: 'high', ourEvidence: { contentState: 'new' } });
  if (create !== 'CREATE' || update !== 'UPDATE' || hold !== 'HOLD') {
    throw new Error('Growth Brain action mapping self-test failed.');
  }
  const p = opportunityPriority({ rank: 1, risk: 'low', confidence: 'medium', monetizationRoute: 'avcams-viewer', ourEvidence: { impressions: 50, bestPosition: 8 } });
  if (!(p >= 1 && p <= 100)) throw new Error('Growth Brain priority self-test failed.');
  console.log('GROWTH_BRAIN_SELF_TEST_PASS');
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const [growth, offers] = await Promise.all([
  readJson(opportunitiesPath, {}),
  readJson(offersPath, { offers: [] })
]);

const generatedAt = new Date().toISOString();
const decisions = [];

for (const opportunity of growth?.opportunities || []) {
  const action = actionFor(opportunity);
  const priority = opportunityPriority(opportunity);
  decisions.push({
    id: 'search:' + String(opportunity.id || opportunity.rank),
    kind: 'search',
    action,
    priority,
    eligible: action !== 'HOLD',
    subject: opportunity.targetKeyword || 'unknown',
    surface: opportunity?.ourEvidence?.page || null,
    monetizationRoute: opportunity.monetizationRoute || null,
    risk: opportunity.risk || 'unknown',
    confidence: opportunity.confidence || 'unknown',
    rationale: opportunity.recommendedAction || null,
    evidence: {
      impressions: Number(opportunity?.ourEvidence?.impressions || 0),
      clicks: Number(opportunity?.ourEvidence?.clicks || 0),
      bestPosition: opportunity?.ourEvidence?.bestPosition ?? null,
      queryVariants: Number(opportunity?.ourEvidence?.queryVariants || 0)
    },
    payload: opportunity
  });
}

for (const row of growth?.ctaOpportunities || []) {
  decisions.push({
    id: 'cta:' + String(row.host || 'unknown') + ':' + String(row.page || '/'),
    kind: 'conversion',
    action: 'EXPERIMENT',
    priority: ctaPriority(row),
    eligible: Number(row.sessions || 0) >= 20,
    subject: String(row.host || '') + String(row.page || '/'),
    surface: row.page || null,
    monetizationRoute: null,
    risk: 'low',
    confidence: Number(row.sessions || 0) >= 100 ? 'medium' : 'low',
    rationale: row.recommendedAction || 'Measure CTA visibility and offer alignment.',
    evidence: {
      sessions: Number(row.sessions || 0),
      affiliateClicks: Number(row.affiliateClicks || 0),
      affiliateCtr: row.affiliateCtr == null ? null : Number(row.affiliateCtr),
      engagementRate: row.engagementRate == null ? null : Number(row.engagementRate)
    },
    payload: row
  });
}

for (const row of growth?.behaviorOpportunities || []) {
  decisions.push({
    id: 'behavior:' + String(row.page || '/'),
    kind: 'behavior',
    action: 'EXPERIMENT',
    priority: behaviorPriority(row),
    eligible: Number(row.severity || 0) > 0,
    subject: row.page || '/',
    surface: row.page || '/',
    monetizationRoute: null,
    risk: 'medium',
    confidence: Number(row.sessions || 0) >= 50 ? 'medium' : 'low',
    rationale: row.recommendedAction || 'Inspect behavioral friction and test a reversible fix.',
    evidence: {
      sessions: row.sessions == null ? null : Number(row.sessions),
      severity: Number(row.severity || 0),
      signals: row.signals || []
    },
    payload: row
  });
}

for (const row of growth?.authorityOpportunities || []) {
  decisions.push({
    id: 'authority:' + String(row.site || 'unknown'),
    kind: 'authority',
    action: 'BUILD_AUTHORITY',
    priority: row.status === 'authority_gap' ? 62 : 52,
    eligible: true,
    subject: row.site || 'unknown',
    surface: null,
    monetizationRoute: null,
    risk: 'low',
    confidence: 'medium',
    rationale: row.recommendedAction || null,
    evidence: {
      observedInboundLinks: Number(row.observedInboundLinks || 0),
      linkedTargetPages: Number(row.linkedTargetPages || 0)
    },
    payload: row
  });
}

decisions.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

const safeCreateCount = decisions.filter((row) => row.action === 'CREATE' && row.eligible).length;
const updateCount = decisions.filter((row) => ['UPDATE', 'MIGRATE'].includes(row.action) && row.eligible).length;
const experimentCount = decisions.filter((row) => row.action === 'EXPERIMENT' && row.eligible).length;

const result = {
  version: 2,
  generatedAt,
  sourceGeneratedAt: growth?.generatedAt || null,
  objective: 'maximize durable traffic, affiliate conversion and attributable revenue without lowering editorial or policy quality',
  governor: {
    authorityMode: process.env.CONTROL_PLANE_MODE || 'shadow',
    publicationTargetPerHour: 5,
    publicationHardMaxPerHour: 5,
    minimumAcceptedPublicationsPerHour: 1,
    maxConcurrentExperiments: 1,
    minimumEditorialWords: 700,
    duplicateSimilarityBlockThreshold: 0.42,
    highRiskActionsAutoImplemented: false,
    fillerContentAllowed: false,
    qualityGateCanReduceOutput: true,
    rule: 'Targets are ceilings/objectives, never permission to ship thin, duplicative, unsupported or cannibalizing content.'
  },
  commercialState: {
    activeOfferIds: safeOfferIds(offers),
    aggregateMonetization: growth?.monetization || null,
    attributionSource: growth?.sources?.attribution || null
  },
  portfolio: {
    safeCreateCount,
    updateCount,
    experimentCount,
    totalDecisions: decisions.length
  },
  decisions
};

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n');

const lines = [
  '# Growth Brain v2 — Decision Plan',
  '',
  'Generated: ' + generatedAt,
  '',
  'Governor: ' + JSON.stringify(result.governor),
  '',
  '## Ranked decisions',
  ''
];
for (const decision of decisions.slice(0, 40)) {
  lines.push(
    '- **' + decision.action + '** · ' + decision.priority + ' · ' + decision.subject +
    ' · eligible=' + decision.eligible +
    ' · risk=' + decision.risk +
    ' · confidence=' + decision.confidence +
    (decision.rationale ? ' · ' + decision.rationale : '')
  );
}
await fs.writeFile(path.join(outDir, 'latest.md'), lines.join('\n') + '\n');
console.log('GROWTH_BRAIN_V2_OK ' + JSON.stringify(result.portfolio));
