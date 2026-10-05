import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const endpoint = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';
const token = String(process.env.CLARITY_API_TOKEN || '').trim();
const date = process.env.SEO_END_DATE || daysAgo(0);
const numOfDays = Math.min(3, Math.max(1, Number(process.env.CLARITY_NUM_DAYS || 3)));

export function normalizeClarityPayload(payload) {
  const metrics = Array.isArray(payload) ? payload : [];
  return metrics.map((metric) => ({
    metricName: String(metric?.metricName || 'unknown'),
    information: Array.isArray(metric?.information) ? metric.information : []
  }));
}

function selfTest() {
  const sample = normalizeClarityPayload([
    { metricName: 'Traffic', information: [{ URL: 'https://stripunion.com/', totalSessionCount: '12' }] },
    { metricName: 'Rage Click Count', information: [{ URL: 'https://stripunion.com/avcams', rageClickCount: '2' }] }
  ]);
  if (sample.length !== 2) throw new Error('Clarity payload normalization count failed.');
  if (sample[1].information[0].rageClickCount !== '2') throw new Error('Clarity payload normalization content failed.');
  console.log('CLARITY_COLLECTOR_SELF_TEST_PASS');
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

if (!token) {
  console.log('Clarity collection skipped: CLARITY_API_TOKEN is not configured.');
  process.exit(0);
}

const url = new URL(endpoint);
url.searchParams.set('numOfDays', String(numOfDays));
url.searchParams.set('dimension1', 'URL');

const response = await fetch(url, {
  method: 'GET',
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`
  },
  signal: AbortSignal.timeout(20_000)
});

if (!response.ok) {
  const diagnostic = (await response.text()).slice(0, 500).replace(/\s+/g, ' ').trim();
  throw new Error(`Clarity export failed: HTTP ${response.status}${diagnostic ? `: ${diagnostic}` : ''}`);
}

const metrics = normalizeClarityPayload(await response.json());
await writeSnapshot('clarity', date, {
  source: 'microsoft-clarity-data-export',
  collectedAt: new Date().toISOString(),
  projectId: process.env.PUBLIC_CLARITY_PROJECT_ID || 'ysuowheiiz',
  numOfDays,
  dimension1: 'URL',
  metricNames: metrics.map((metric) => metric.metricName),
  metrics
});

console.log(`Clarity snapshot collected: ${metrics.length} metric groups for the last ${numOfDays} day(s).`);
