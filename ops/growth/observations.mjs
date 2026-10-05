import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const growthPath = path.join(root, 'ops/growth/opportunities/latest.json');
const outDir = path.join(root, 'ops/growth/observations');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function latestRaw(name) {
  const rawRoot = path.join(root, 'ops/seo-data-layer/data/raw');
  let dirs = [];
  try {
    dirs = (await fs.readdir(rawRoot)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort().reverse();
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const value = await readJson(path.join(rawRoot, dir, name + '.json'), null);
    if (value) return { date: dir, data: value };
  }
  return null;
}

function id(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function observation({ observedAt, source, entityType, entityId = null, metric, valueNumeric = null, valueText = null, dimensions = {}, payload = {} }) {
  return {
    observationId: id([observedAt.slice(0, 10), source, entityType, entityId || '', metric, JSON.stringify(dimensions)]),
    observedAt,
    source,
    entityType,
    entityId,
    metric,
    valueNumeric: valueNumeric == null ? null : Number(valueNumeric),
    valueText,
    dimensions,
    payload
  };
}

function selfTest() {
  const row = observation({
    observedAt: '2026-10-05T00:00:00.000Z',
    source: 'test',
    entityType: 'site',
    metric: 'sessions',
    valueNumeric: 2
  });
  if (!row.observationId || row.valueNumeric !== 2) throw new Error('Observation self-test failed.');
  console.log('GROWTH_OBSERVATIONS_SELF_TEST_PASS');
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const [growth, attributionRaw] = await Promise.all([
  readJson(growthPath, {}),
  latestRaw('attribution')
]);

const observedAt = growth?.generatedAt || new Date().toISOString();
const rows = [];

for (const item of growth?.ctaOpportunities || []) {
  const entityId = String(item.host || '') + String(item.page || '/');
  rows.push(observation({
    observedAt,
    source: 'ga4',
    entityType: 'page',
    entityId,
    metric: 'sessions',
    valueNumeric: item.sessions,
    payload: item
  }));
  rows.push(observation({
    observedAt,
    source: 'ga4',
    entityType: 'page',
    entityId,
    metric: 'affiliate_clicks',
    valueNumeric: item.affiliateClicks,
    payload: item
  }));
  if (item.affiliateCtr != null) {
    rows.push(observation({
      observedAt,
      source: 'ga4',
      entityType: 'page',
      entityId,
      metric: 'affiliate_ctr',
      valueNumeric: item.affiliateCtr,
      payload: item
    }));
  }
}

for (const item of growth?.behaviorOpportunities || []) {
  rows.push(observation({
    observedAt,
    source: 'clarity',
    entityType: 'page',
    entityId: item.page || '/',
    metric: 'behavior_friction_severity',
    valueNumeric: item.severity,
    dimensions: { sessions: item.sessions ?? null },
    payload: item
  }));
}

for (const item of growth?.authorityOpportunities || []) {
  rows.push(observation({
    observedAt,
    source: 'bing',
    entityType: 'site',
    entityId: item.site || 'unknown',
    metric: 'observed_inbound_links',
    valueNumeric: item.observedInboundLinks,
    payload: item
  }));
}

const attribution = attributionRaw?.data;
if (attribution) {
  const attributionAt = attribution.collectedAt || observedAt;
  for (const [metric, value] of [
    ['total_clicks', attribution.totalClicks],
    ['total_postbacks', attribution.totalPostbacks],
    ['matched_postbacks', attribution.matchedPostbacks],
    ['unmatched_postbacks', attribution.unmatchedPostbacks],
    ['duplicate_postbacks', attribution.duplicatePostbacks]
  ]) {
    rows.push(observation({
      observedAt: attributionAt,
      source: 'first_party_attribution',
      entityType: 'site',
      entityId: 'stripunion.com',
      metric,
      valueNumeric: value,
      payload: { attributionDate: attributionRaw.date }
    }));
  }

  for (const [currency, value] of Object.entries(attribution.revenueByCurrency || {})) {
    rows.push(observation({
      observedAt: attributionAt,
      source: 'first_party_attribution',
      entityType: 'site',
      entityId: 'stripunion.com',
      metric: 'attributed_revenue',
      valueNumeric: value,
      dimensions: { currency },
      payload: { attributionDate: attributionRaw.date }
    }));
  }

  for (const [pageKey, bucket] of Object.entries(attribution.byP1 || {})) {
    for (const [metric, value] of [
      ['clicks', bucket.clicks],
      ['postbacks', bucket.postbacks],
      ['matched_postbacks', bucket.matchedPostbacks]
    ]) {
      rows.push(observation({
        observedAt: attributionAt,
        source: 'first_party_attribution',
        entityType: 'page_key',
        entityId: pageKey,
        metric,
        valueNumeric: value,
        payload: bucket
      }));
    }
    for (const [currency, value] of Object.entries(bucket.revenueByCurrency || {})) {
      rows.push(observation({
        observedAt: attributionAt,
        source: 'first_party_attribution',
        entityType: 'page_key',
        entityId: pageKey,
        metric: 'attributed_revenue',
        valueNumeric: value,
        dimensions: { currency },
        payload: bucket
      }));
    }
  }

  for (const [experimentId, experiment] of Object.entries(attribution.byExperiment || {})) {
    for (const [variant, bucket] of Object.entries(experiment.variants || {})) {
      for (const [metric, value] of [
        ['impressions', bucket.impressions],
        ['clicks', bucket.clicks],
        ['postbacks', bucket.postbacks],
        ['matched_postbacks', bucket.matchedPostbacks]
      ]) {
        rows.push(observation({
          observedAt: attributionAt,
          source: 'first_party_attribution',
          entityType: 'experiment',
          entityId: experimentId,
          metric,
          valueNumeric: value,
          dimensions: { variant },
          payload: bucket
        }));
      }
      for (const [currency, value] of Object.entries(bucket.revenueByCurrency || {})) {
        rows.push(observation({
          observedAt: attributionAt,
          source: 'first_party_attribution',
          entityType: 'experiment',
          entityId: experimentId,
          metric: 'attributed_revenue',
          valueNumeric: value,
          dimensions: { variant, currency },
          payload: bucket
        }));
      }
    }
  }
}

const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sourceGeneratedAt: growth?.generatedAt || null,
  attributionDate: attributionRaw?.date || null,
  observations: rows
};

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
console.log('GROWTH_OBSERVATIONS_OK ' + JSON.stringify({ observations: rows.length, attributionConnected: Boolean(attribution) }));
