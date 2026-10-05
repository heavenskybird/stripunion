import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { controlPlaneConfig, upsertRows } from '../ops/control-plane/client.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const now = () => new Date().toISOString();

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function listJson(dir) {
  try {
    return (await fs.readdir(path.join(root, dir))).filter((name) => name.endsWith('.json')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export function opportunityRow(item, generatedAt, observedAt) {
  return {
    opportunity_id: String(item.id || 'rank-' + item.rank),
    rank: Number.isInteger(item.rank) ? item.rank : null,
    target_keyword: item.targetKeyword || null,
    recommended_action: item.recommendedAction || null,
    traffic_intent: item.trafficIntent || null,
    commercial_intent: item.commercialIntent || null,
    monetization_route: item.monetizationRoute || null,
    confidence: item.confidence || null,
    risk: item.risk || null,
    source_generated_at: generatedAt || null,
    last_seen_at: observedAt,
    payload: item
  };
}

export function jobRow(item, updatedAt) {
  return {
    job_id: String(item.id),
    intent: item.intent || null,
    category: item.category || null,
    surface: item.surface || null,
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : null,
    status: String(item.status || 'unknown'),
    artifact_path: item.id ? 'ops/editorial/content-artifacts/' + item.id + '.json' : null,
    updated_at: updatedAt,
    payload: item
  };
}

export function publicationRow(item, observedAt) {
  return {
    publication_id: 'astro:' + String(item.slug),
    slug: String(item.slug),
    title: item.title || null,
    category: item.category || null,
    category_slug: item.category_slug || null,
    url: item.url || null,
    channel: 'astro',
    status: item.distribution_state || 'published',
    published_at: item.published_at || null,
    verified_at: item.verified_at || null,
    updated_at: observedAt,
    payload: item
  };
}

export function offerRow(item, observedAt) {
  return {
    offer_id: String(item.id),
    brand: item.brand || null,
    category: item.category || null,
    status: String(item.status || 'unknown'),
    relationship: item.relationship || null,
    updated_at: observedAt,
    payload: item
  };
}

async function loadSnapshot() {
  const observedAt = now();
  const [opportunities, backlog, offers] = await Promise.all([
    readJson('ops/growth/opportunities/latest.json', { opportunities: [], generatedAt: null }),
    readJson('ops/editorial/hourly-backlog.json', { queue: [], updated_at: null }),
    readJson('ops/growth/offers/direct-offers.json', { offers: [] })
  ]);

  const publicationFiles = await listJson('ops/editorial/publication-ledger/astro');
  const publications = [];
  for (const name of publicationFiles) {
    const item = await readJson('ops/editorial/publication-ledger/astro/' + name);
    if (item?.slug) publications.push(item);
  }

  const opportunityRows = (opportunities?.opportunities || [])
    .filter(Boolean)
    .map((item) => opportunityRow(item, opportunities.generatedAt || null, observedAt));

  const jobRows = (backlog?.queue || [])
    .filter((item) => item?.id)
    .map((item) => jobRow(item, observedAt));

  const publicationRows = publications.map((item) => publicationRow(item, observedAt));
  const offerRows = (offers?.offers || [])
    .filter((item) => item?.id)
    .map((item) => offerRow(item, observedAt));

  return {
    observedAt,
    opportunityRows,
    jobRows,
    publicationRows,
    offerRows,
    counts: {
      opportunities: opportunityRows.length,
      contentJobs: jobRows.length,
      publications: publicationRows.length,
      affiliateOffers: offerRows.length
    }
  };
}

async function selfTest() {
  const at = '2026-10-05T00:00:00.000Z';
  const opportunity = opportunityRow({ id: 'gsc-test', rank: 1, targetKeyword: 'test' }, at, at);
  const job = jobRow({ id: 'job-test', status: 'ready', priority: 90 }, at);
  const publication = publicationRow({ slug: 'test-guide', distribution_state: 'distributed' }, at);
  const offer = offerRow({ id: 'offer-test', status: 'active' }, at);

  if (opportunity.opportunity_id !== 'gsc-test') throw new Error('Opportunity mapping self-test failed.');
  if (job.job_id !== 'job-test' || job.priority !== 90) throw new Error('Job mapping self-test failed.');
  if (publication.publication_id !== 'astro:test-guide') throw new Error('Publication mapping self-test failed.');
  if (offer.offer_id !== 'offer-test') throw new Error('Offer mapping self-test failed.');
  console.log('GROWTH_CONTROL_PLANE_SELF_TEST_PASS');
}

if (process.argv.includes('--self-test')) {
  await selfTest();
  process.exit(0);
}

const config = controlPlaneConfig();
if (!config.configured) {
  const missing = [
    !config.url ? 'SUPABASE_URL' : null,
    !config.serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null
  ].filter(Boolean);

  const message = 'Growth control plane is not configured; missing ' + missing.join(', ') + '.';
  if (config.required) throw new Error(message);
  console.log('GROWTH_CONTROL_PLANE_SKIP ' + JSON.stringify({ configured: false, missing }));
  process.exit(0);
}

const runId = randomUUID();
const startedAt = now();

try {
  const snapshot = await loadSnapshot();

  await upsertRows(config, 'control_plane_runs', [{
    id: runId,
    source: 'repository-shadow-sync',
    status: 'running',
    started_at: startedAt,
    snapshot: snapshot.counts,
    error: null
  }], 'id');

  await upsertRows(config, 'growth_opportunities', snapshot.opportunityRows, 'opportunity_id');
  await upsertRows(config, 'content_jobs', snapshot.jobRows, 'job_id');
  await upsertRows(config, 'publications', snapshot.publicationRows, 'publication_id');
  await upsertRows(config, 'affiliate_offers', snapshot.offerRows, 'offer_id');

  await upsertRows(config, 'control_plane_runs', [{
    id: runId,
    source: 'repository-shadow-sync',
    status: 'succeeded',
    started_at: startedAt,
    completed_at: now(),
    snapshot: snapshot.counts,
    error: null
  }], 'id');

  console.log('GROWTH_CONTROL_PLANE_SYNC_OK ' + JSON.stringify(snapshot.counts));
} catch (error) {
  try {
    await upsertRows(config, 'control_plane_runs', [{
      id: runId,
      source: 'repository-shadow-sync',
      status: 'failed',
      started_at: startedAt,
      completed_at: now(),
      snapshot: {},
      error: error instanceof Error ? error.message.slice(0, 1200) : String(error).slice(0, 1200)
    }], 'id');
  } catch {}

  throw error;
}
