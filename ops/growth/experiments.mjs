import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const growthPath = path.join(root, 'ops/growth/opportunities/latest.json');
const outDir = path.join(root, 'ops/growth/experiments');
const statePath = path.join(outDir, 'state.json');
const activePath = path.join(outDir, 'active.json');
const MIN_START_SESSIONS = 100;
const MIN_IMPRESSIONS_PER_VARIANT = 100;
const MIN_DAYS = 7;
const MAX_DAYS = 14;

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

function stableId(host, page) {
  const hash = crypto.createHash('sha256').update(String(host) + '|' + String(page)).digest('hex').slice(0, 12);
  return 'cta-copy-' + hash;
}

function daysBetween(start, end = new Date()) {
  const t = Date.parse(start || '');
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (end.getTime() - t) / 86_400_000);
}

function variantMetrics(attribution, experimentId) {
  const row = attribution?.byExperiment?.[experimentId];
  if (!row?.variants) return null;
  const normalize = (name) => {
    const v = row.variants[name] || {};
    return {
      impressions: Number(v.impressions || 0),
      clicks: Number(v.clicks || 0),
      postbacks: Number(v.postbacks || 0),
      matchedPostbacks: Number(v.matchedPostbacks || 0),
      revenueByCurrency: v.revenueByCurrency || {}
    };
  };
  return { control: normalize('control'), treatment: normalize('treatment') };
}

function zScore(aClicks, aN, bClicks, bN) {
  if (!(aN > 0 && bN > 0)) return 0;
  const p1 = aClicks / aN;
  const p2 = bClicks / bN;
  const pooled = (aClicks + bClicks) / (aN + bN);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / aN + 1 / bN));
  return se > 0 ? (p2 - p1) / se : 0;
}

function evaluate(experiment, attribution, now) {
  if (experiment.status !== 'running') return experiment;
  const metrics = variantMetrics(attribution, experiment.experimentId);
  if (!metrics) return { ...experiment, lastEvaluation: { at: now, status: 'insufficient_telemetry' } };

  const a = metrics.control;
  const b = metrics.treatment;
  const ageDays = daysBetween(experiment.startedAt);
  const ready = a.impressions >= MIN_IMPRESSIONS_PER_VARIANT &&
    b.impressions >= MIN_IMPRESSIONS_PER_VARIANT &&
    ageDays >= MIN_DAYS;

  const controlCtr = a.impressions ? a.clicks / a.impressions : 0;
  const treatmentCtr = b.impressions ? b.clicks / b.impressions : 0;
  const z = zScore(a.clicks, a.impressions, b.clicks, b.impressions);
  const relativeLift = controlCtr > 0 ? (treatmentCtr - controlCtr) / controlCtr : (treatmentCtr > 0 ? 1 : 0);

  const evaluation = {
    at: now,
    ageDays: Number(ageDays.toFixed(2)),
    control: { ...a, ctr: controlCtr },
    treatment: { ...b, ctr: treatmentCtr },
    zScore: Number(z.toFixed(3)),
    relativeLift: Number(relativeLift.toFixed(4)),
    ready
  };

  if (ready && Math.abs(z) >= 1.96 && Math.abs(relativeLift) >= 0.10) {
    const winner = treatmentCtr > controlCtr ? 'treatment' : 'control';
    return { ...experiment, status: 'completed', endedAt: now, winner, lastEvaluation: { ...evaluation, status: 'winner_selected' } };
  }

  if (ageDays >= MAX_DAYS) {
    return { ...experiment, status: 'completed', endedAt: now, winner: null, lastEvaluation: { ...evaluation, status: 'inconclusive' } };
  }

  return { ...experiment, lastEvaluation: { ...evaluation, status: ready ? 'continue_no_significant_winner' : 'collecting' } };
}

function candidateFrom(row) {
  const id = stableId(row.host, row.page);
  return {
    experimentId: id,
    status: 'proposed',
    kind: 'avcams_cta_copy',
    surface: row.page,
    host: row.host,
    hypothesis: 'A clearer action-oriented AVCams CTA can improve affiliate click-through without reducing editorial trust.',
    primaryMetric: 'affiliate_ctr',
    allocation: { control: 0.5, treatment: 0.5 },
    variants: {
      control: { labelMode: 'original' },
      treatment: { label: 'Explore live options →' }
    },
    guardrails: {
      minimumSessionsToStart: MIN_START_SESSIONS,
      minimumImpressionsPerVariant: MIN_IMPRESSIONS_PER_VARIANT,
      minimumDays: MIN_DAYS,
      maximumDays: MAX_DAYS,
      winnerZScore: 1.96,
      minimumAbsoluteRelativeLift: 0.10,
      maximumConcurrentExperiments: 1
    },
    evidence: {
      sessions: Number(row.sessions || 0),
      affiliateClicks: Number(row.affiliateClicks || 0),
      affiliateCtr: row.affiliateCtr == null ? null : Number(row.affiliateCtr)
    }
  };
}

function selfTest() {
  const z = zScore(10, 100, 20, 100);
  if (!(z > 1)) throw new Error('Experiment z-score self-test failed.');
  const id1 = stableId('stripunion.com', '/a');
  const id2 = stableId('stripunion.com', '/a');
  if (id1 !== id2) throw new Error('Experiment ID self-test failed.');
  console.log('GROWTH_EXPERIMENT_ENGINE_SELF_TEST_PASS');
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

await fs.mkdir(outDir, { recursive: true });

const [growth, attributionRaw, previous] = await Promise.all([
  readJson(growthPath, {}),
  latestRaw('attribution'),
  readJson(statePath, { version: 1, experiments: [] })
]);

const now = new Date().toISOString();
const attribution = attributionRaw?.data || {};
let experiments = (previous.experiments || []).map((item) => evaluate(item, attribution, now));

const known = new Set(experiments.map((item) => item.experimentId));
for (const row of growth?.ctaOpportunities || []) {
  if (String(row.host || '').replace(/^www\./, '') !== 'stripunion.com') continue;
  const candidate = candidateFrom(row);
  if (!known.has(candidate.experimentId)) {
    experiments.push(candidate);
    known.add(candidate.experimentId);
  }
}

const running = experiments.filter((item) => item.status === 'running');
if (!running.length) {
  const eligible = experiments
    .filter((item) => item.status === 'proposed')
    .filter((item) => Number(item?.evidence?.sessions || 0) >= MIN_START_SESSIONS)
    .sort((a, b) => Number(b.evidence.sessions || 0) - Number(a.evidence.sessions || 0))[0];

  if (eligible) {
    eligible.status = 'running';
    eligible.startedAt = now;
    eligible.endedAt = null;
    eligible.winner = null;
  }
}

experiments.sort((a, b) => {
  const order = { running: 0, proposed: 1, completed: 2 };
  return (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.experimentId.localeCompare(b.experimentId);
});

const state = {
  version: 1,
  generatedAt: now,
  attributionDate: attributionRaw?.date || null,
  policy: {
    maxConcurrent: 1,
    autoStartThresholdSessions: MIN_START_SESSIONS,
    minImpressionsPerVariant: MIN_IMPRESSIONS_PER_VARIANT,
    minDays: MIN_DAYS,
    maxDays: MAX_DAYS,
    primaryMetric: 'affiliate_ctr'
  },
  experiments
};

const active = {
  version: 1,
  generatedAt: now,
  experiments: experiments
    .filter((item) => item.status === 'running')
    .map((item) => ({
      experimentId: item.experimentId,
      kind: item.kind,
      host: item.host,
      surface: item.surface,
      allocation: item.allocation,
      variants: item.variants,
      startedAt: item.startedAt
    }))
};

await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
await fs.writeFile(activePath, JSON.stringify(active, null, 2) + '\n');

const lines = [
  '# Growth Experiment Engine',
  '',
  'Generated: ' + now,
  '',
  'Running: ' + active.experiments.length,
  'Proposed: ' + experiments.filter((item) => item.status === 'proposed').length,
  'Completed: ' + experiments.filter((item) => item.status === 'completed').length,
  '',
  ...experiments.map((item) =>
    '- **' + item.status.toUpperCase() + '** ' + item.experimentId + ' · ' + item.surface +
    ' · sessions=' + Number(item?.evidence?.sessions || 0) +
    (item.winner ? ' · winner=' + item.winner : '')
  )
];
await fs.writeFile(path.join(outDir, 'latest.md'), lines.join('\n') + '\n');
console.log('GROWTH_EXPERIMENT_ENGINE_OK ' + JSON.stringify({
  running: active.experiments.length,
  proposed: experiments.filter((item) => item.status === 'proposed').length,
  completed: experiments.filter((item) => item.status === 'completed').length
}));
