import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlPlaneConfig, selectRows } from '../ops/control-plane/client.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modePath = path.join(root, 'ops/control-plane/mode.json');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function jsonFiles(dir) {
  try {
    return (await fs.readdir(path.join(root, dir))).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

function setOf(values) {
  return new Set(values.filter(Boolean).map(String));
}

function missingFrom(expected, actual) {
  return [...expected].filter((value) => !actual.has(value)).sort();
}

function minutesBetween(a, b) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 60000;
}

export function collapseCycles(runs, duplicateWindowMinutes = 30) {
  const sorted = [...runs]
    .filter((run) => run?.started_at)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));

  const cycles = [];
  for (const run of sorted) {
    const last = cycles.at(-1);
    if (!last || minutesBetween(last.anchor.started_at, run.started_at) > duplicateWindowMinutes) {
      cycles.push({ anchor: run, runs: [run] });
    } else {
      last.runs.push(run);
    }
  }
  return cycles;
}

export function evaluateCycles(runs, required = 24, maxGapMinutes = 110) {
  const cycles = collapseCycles(runs);
  const selected = cycles.slice(0, required).reverse();
  const enough = selected.length >= required;
  const failures = selected.flatMap((cycle) =>
    cycle.runs.filter((run) => run.status !== 'succeeded' || run.error).map((run) => ({
      id: run.id,
      startedAt: run.started_at,
      status: run.status,
      error: run.error || null
    }))
  );
  const gaps = [];
  for (let index = 1; index < selected.length; index += 1) {
    const previous = selected[index - 1].anchor.started_at;
    const current = selected[index].anchor.started_at;
    const gapMinutes = minutesBetween(previous, current);
    if (gapMinutes > maxGapMinutes) gaps.push({ previous, current, gapMinutes: Number(gapMinutes.toFixed(1)) });
  }
  return {
    enough,
    cycleCount: selected.length,
    failures,
    gaps,
    firstStartedAt: selected[0]?.anchor?.started_at || null,
    lastStartedAt: selected.at(-1)?.anchor?.started_at || null,
    ready: enough && failures.length === 0 && gaps.length === 0
  };
}

async function repositoryState() {
  const [backlog, opportunities, offers, publicationFiles] = await Promise.all([
    readJson(path.join(root, 'ops/editorial/hourly-backlog.json'), { queue: [] }),
    readJson(path.join(root, 'ops/growth/opportunities/latest.json'), { opportunities: [] }),
    readJson(path.join(root, 'ops/growth/offers/direct-offers.json'), { offers: [] }),
    jsonFiles('ops/editorial/publication-ledger/astro')
  ]);

  return {
    contentJobs: setOf((backlog.queue || []).map((item) => item.id)),
    publications: setOf(publicationFiles.map((name) => 'astro:' + path.basename(name, '.json'))),
    opportunities: setOf((opportunities.opportunities || []).map((item) => item.id)),
    affiliateOffers: setOf((offers.offers || []).map((item) => item.id))
  };
}

async function databaseState(config) {
  const [jobs, publications, opportunities, offers] = await Promise.all([
    selectRows(config, 'content_jobs', 'select=job_id&limit=5000'),
    selectRows(config, 'publications', 'select=publication_id&limit=5000'),
    selectRows(config, 'growth_opportunities', 'select=opportunity_id&limit=5000'),
    selectRows(config, 'affiliate_offers', 'select=offer_id&limit=5000')
  ]);
  return {
    contentJobs: setOf(jobs.map((item) => item.job_id)),
    publications: setOf(publications.map((item) => item.publication_id)),
    opportunities: setOf(opportunities.map((item) => item.opportunity_id)),
    affiliateOffers: setOf(offers.map((item) => item.offer_id))
  };
}

function mirrorComparison(repoState, dbState) {
  const result = {};
  let ready = true;
  for (const key of ['contentJobs', 'publications', 'opportunities', 'affiliateOffers']) {
    const missing = missingFrom(repoState[key], dbState[key]);
    result[key] = {
      repositoryCount: repoState[key].size,
      databaseCount: dbState[key].size,
      missingInDatabase: missing
    };
    if (missing.length) ready = false;
  }
  return { ready, result };
}

function selfTest() {
  const base = Date.parse('2026-10-05T00:07:00Z');
  const runs = Array.from({ length: 24 }, (_, index) => ({
    id: String(index),
    status: 'succeeded',
    started_at: new Date(base + index * 3600000).toISOString(),
    error: null
  }));
  const good = evaluateCycles(runs);
  if (!good.ready) throw new Error('Readiness cycle self-test failed for healthy series.');
  const broken = evaluateCycles(runs.filter((_, index) => index !== 10));
  if (broken.ready || broken.gaps.length !== 1) throw new Error('Readiness cycle self-test failed to detect missing cycle.');
  console.log('CONTROL_PLANE_READINESS_SELF_TEST_PASS');
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const config = controlPlaneConfig();
if (!config.configured) throw new Error('Supabase Control Plane configuration is required for readiness checks.');

const mode = await readJson(modePath, { version: 1, mode: 'shadow' });
const requiredCycles = Number(mode?.promotion_policy?.required_hourly_cycles || 24);
const maxGapMinutes = Number(mode?.promotion_policy?.max_gap_minutes || 110);
const source = String(mode?.promotion_policy?.source || 'editorial-hourly-producer');

const runs = await selectRows(
  config,
  'control_plane_runs',
  'select=id,source,status,started_at,completed_at,snapshot,error&source=eq.' +
    encodeURIComponent(source) +
    '&order=started_at.desc&limit=100'
);
const cycleCheck = evaluateCycles(runs, requiredCycles, maxGapMinutes);
const [repoState, dbState] = await Promise.all([repositoryState(), databaseState(config)]);
const mirrorCheck = mirrorComparison(repoState, dbState);

const result = {
  checkedAt: new Date().toISOString(),
  currentMode: mode.mode || 'shadow',
  source,
  requiredCycles,
  maxGapMinutes,
  cycleCheck,
  mirrorCheck,
  ready: cycleCheck.ready && mirrorCheck.ready
};

console.log('CONTROL_PLANE_READINESS ' + JSON.stringify(result));

if (result.ready && mode.mode !== 'authoritative' && process.env.AUTO_PROMOTE === 'true') {
  const next = {
    ...mode,
    mode: 'authoritative',
    promoted_at: result.checkedAt,
    promotion_evidence: {
      source,
      requiredCycles,
      firstStartedAt: cycleCheck.firstStartedAt,
      lastStartedAt: cycleCheck.lastStartedAt,
      mirrorCounts: Object.fromEntries(
        Object.entries(mirrorCheck.result).map(([key, value]) => [
          key,
          { repository: value.repositoryCount, database: value.databaseCount }
        ])
      )
    }
  };
  await fs.writeFile(modePath, JSON.stringify(next, null, 2) + '\n');
  console.log('CONTROL_PLANE_PROMOTED authoritative');
}

if (process.argv.includes('--require-ready') && !result.ready) {
  process.exitCode = 2;
}
