import fs from 'node:fs/promises';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { guideFingerprints } from './publication-deployment.mjs';
import { probeUrl, probeDeployment } from './check-live-publications.mjs';
import { getRecords, newestFirst, summarizeLogs } from './hostinger-readonly-check.mjs';

function errorCode(error) {
  const codes = new Set(['ETIMEDOUT','ENETUNREACH','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','TimeoutError','AbortError']);
  return codes.has(error?.cause?.code) ? error.cause.code : codes.has(error?.code) ? error.code : codes.has(error?.name) ? error.name : 'TRANSPORT_ERROR';
}
async function request(url, headers = {}) {
  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 1_000_000) return { status: response.status, error: 'BODY_LIMIT' };
    return { status: response.status, finalHost: new URL(response.url).hostname, body: Buffer.from(bytes).toString('utf8') };
  } catch (error) { return { status: 0, error: errorCode(error) }; }
}
function ipv4Probe(url) {
  return new Promise(resolve => {
    const req = https.get(url, { family: 4, headers: { 'user-agent': 'StripUnion-Public-Health-Oracle/1.0' }, timeout: 12_000 }, res => {
      res.resume(); resolve({ status: res.statusCode, family: 4 });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error(), { code: 'ETIMEDOUT' })));
    req.on('error', error => resolve({ status: 0, family: 4, error: errorCode(error) }));
  });
}
async function api(url, token) {
  const result = await request(url, { authorization: `Bearer ${token}`, accept: 'application/json' });
  let data; try { data = JSON.parse(result.body || 'null'); } catch {}
  return { status: result.status, error: result.error || null, data };
}
const base = 'https://api.github.com/repos/heavenskybird/stripunion';
const github = endpoint => api(`${base}/${endpoint}`, process.env.GH_TOKEN);
const report = { version: 1, runId: process.env.GITHUB_RUN_ID, checkedAt: new Date().toISOString(), readOnly: true };
const [scheduler, receipt, ...active] = await Promise.all([
  github('actions/workflows/editorial-producer-scheduler.yml'),
  github('contents/ops/control-plane/editorial-r1-receipt.json?ref=codex%2Feditorial-r1-runtime'),
  ...['in_progress','queued','waiting'].map(status => github(`actions/runs?status=${status}&per_page=100`))
]);
report.scheduler = { httpStatus: scheduler.status, state: scheduler.data?.state || 'unknown' };
const state = receipt.status === 200 ? JSON.parse(Buffer.from(receipt.data.content, 'base64').toString('utf8')) : null;
report.receipt = { httpStatus: receipt.status, blobSha: receipt.data?.sha || null, status: state?.status || null,
  cycleId: state?.cycleId || null, runId: state?.runId || null, attempts: state?.attempts || null,
  startedAt: state?.startedAt || null, finishedAt: state?.finishedAt || null,
  recentRunIdsCount: state?.recentRunIds?.length || 0,
  historyHash: state ? createHash('sha256').update(JSON.stringify(state)).digest('hex') : null };
report.mainActiveRuns = active.flatMap(r => (r.data?.workflow_runs || []).filter(run => run.head_branch === 'main').map(run => ({ id: run.id, name: run.name, status: run.status })));
report.activeInventoryComplete = active.every(r => r.status === 200 && r.data.total_count <= 100);
report.nativeSend = { variable: process.env.SOCIAL_OUTBOX_SEND_ENABLED || 'UNSET',
  disabled: String(process.env.SOCIAL_OUTBOX_SEND_ENABLED).toLowerCase() === 'false',
  singleWriter: process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED || 'UNSET' };
const manifest = JSON.parse(await fs.readFile('ops/editorial/pending-publication-batch.json', 'utf8'));
report.manifest = { cycleId: manifest.r1CycleId, phase: manifest.phase, count: manifest.count };
const expected = await guideFingerprints(manifest.guideFiles);
report.publication = { guides: await Promise.all(Object.keys(expected).map(slug => probeUrl(`https://stripunion.com/guides/${slug}`, 10_000))),
  deployment: await probeDeployment(expected, 10_000, fetch) };
report.health = [];
for (const host of ['stripunion.com','blog.stripunion.com','avcams.online']) {
  for (const pathname of ['/', '/robots.txt', host === 'blog.stripunion.com' ? '/sitemap_index.xml' : '/sitemap.xml']) {
    const url = `https://${host}${pathname}`;
    const result = await request(url, { 'user-agent': 'StripUnion-Public-Health-Oracle/1.0' });
    const row = { host, path: pathname, status: result.status, error: result.error || null, finalHost: result.finalHost || null };
    if (result.status === 0) row.ipv4Diagnostic = await ipv4Probe(url);
    if (pathname === '/' && result.status === 200) {
      row.ga4MeasurementIds = [...new Set((result.body || '').match(/\bG-[A-Z0-9]{6,20}\b/g) || [])];
      row.gtagScriptPresent = /googletagmanager\.com\/gtag\/js/.test(result.body || '');
      row.consentDefaultDenied = /consent[\s\S]{0,180}default[\s\S]{0,300}analytics_storage[\s\S]{0,35}denied/.test(result.body || '');
      row.canonical = (result.body || '').match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]?.split(/[?#]/)[0] || null;
    }
    report.health.push(row);
  }
}
report.hostinger = { configured: Boolean(process.env.HOSTINGER_API_TOKEN) };
if (process.env.HOSTINGER_API_TOKEN) {
  const hostBase = 'https://developers.hostinger.com/api/hosting/v1';
  const hostApi = endpoint => api(`${hostBase}/${endpoint}`, process.env.HOSTINGER_API_TOKEN);
  const list = await hostApi('websites?per_page=100');
  const website = getRecords(list.data).find(w => ['stripunion.com','www.stripunion.com'].includes(w.domain));
  report.hostinger.websitesHttp = list.status;
  report.hostinger.mainFound = Boolean(website);
  if (website?.username) {
    const prefix = `accounts/${encodeURIComponent(website.username)}/websites/${encodeURIComponent(website.domain)}`;
    const [env, builds] = await Promise.all([hostApi(`${prefix}/nodejs/builds/settings/env`), hostApi(`${prefix}/nodejs/builds?per_page=100`)]);
    report.hostinger.envHttp = env.status;
    report.hostinger.buildsHttp = builds.status;
    const ga = getRecords(env.data).find(v => (v.name || v.key) === 'PUBLIC_GA4_MEASUREMENT_ID');
    report.hostinger.ga4VariablePresent = Boolean(ga);
    report.hostinger.ga4PublicValue = /^G-[A-Z0-9]{6,20}$/.test(ga?.value || '') ? ga.value : ga ? 'MASKED_OR_INVALID' : null;
    const latest = newestFirst(getRecords(builds.data))[0];
    report.hostinger.latestBuild = latest ? { state: latest.state || latest.status || null, createdAt: latest.created_at || null,
      sha: /^[a-f0-9]{40}$/.test(latest.commit_sha || '') ? latest.commit_sha : null } : null;
    if (latest?.uuid || latest?.id) {
      const logs = await hostApi(`${prefix}/nodejs/builds/${encodeURIComponent(latest.uuid || latest.id)}/logs?from_line=0`);
      const summary = summarizeLogs(logs.data?.data || logs.data, process.env.HOSTINGER_API_TOKEN);
      report.hostinger.logEvidence = { httpStatus: logs.status, lineCount: summary.lineCount, errorCount: summary.errorCount, warningCount: summary.warningCount };
    }
  }
}
report.attribution = { configured: Boolean(process.env.STRIPCASH_POSTBACK_SECRET) };
if (process.env.STRIPCASH_POSTBACK_SECRET) {
  const result = await api('https://stripunion-live-models.stripunion.workers.dev/analytics/summary', process.env.STRIPCASH_POSTBACK_SECRET);
  const summary = result.data?.summary;
  report.attribution = { ...report.attribution, httpStatus: result.status,
    totalClicks: summary?.totalClicks ?? null, totalPostbacks: summary?.totalPostbacks ?? null,
    matchedPostbacks: summary?.matchedPostbacks ?? null, unmatchedPostbacks: summary?.unmatchedPostbacks ?? null,
    duplicatePostbacks: summary?.duplicatePostbacks ?? null, revenueByCurrency: summary?.revenueByCurrency || null,
    diagnostics: summary?.diagnostics || null };
}
await fs.mkdir('work/recovery', { recursive: true });
await fs.writeFile('work/recovery/readonly-evidence.json', JSON.stringify(report, null, 2) + '\n');
console.log('RECOVERY_READONLY_EVIDENCE ' + JSON.stringify(report));
