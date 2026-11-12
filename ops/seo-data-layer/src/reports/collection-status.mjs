import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const definitions = [
  ['gsc', 'GSC'], ['gsc-blog', 'GSC_BLOG'], ['ga4', 'GA4'],
  ['ga4-admin', 'GA4_ADMIN'], ['clarity', 'CLARITY'], ['bing', 'BING'],
  ['buffer', 'BUFFER'], ['stripcash', 'STRIPCASH'], ['attribution', 'ATTRIBUTION']
];
export async function collectionStatus(rawRoot, env, now = Date.now()) {
  const started = Date.parse(env.COLLECTION_STARTED_AT);
  if (!Number.isFinite(started) || started > now || !/^\d+$/.test(env.GITHUB_RUN_ID || '')) throw new Error('Missing current collection identity.');
  const dirs = (await fs.readdir(rawRoot, { withFileTypes: true })).filter(d => d.isDirectory());
  const sources = {};
  for (const [name, key] of [...definitions, ...(env.SEARCH_GROWTH_OUTCOME ? [['search-growth','SEARCH_GROWTH']] : [])]) {
    let latest = null;
    let corrupt = false;
    for (const dir of dirs) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(rawRoot, dir.name, `${name}.json`), 'utf8'));
        const time = Date.parse(data.collectedAt);
        if (Number.isFinite(time) && (!latest || time > latest.time)) latest = { time, collectedAt: data.collectedAt, snapshotDate: dir.name, startDate: data.startDate || null, endDate: data.endDate || null };
      } catch (error) { if (error.code !== 'ENOENT') corrupt = true; }
    }
    const outcome = env[`${key}_OUTCOME`] || 'unknown';
    const configured = name !== 'clarity' || env.CLARITY_CONFIGURED === 'true';
    const current = latest && latest.time >= started && latest.time <= now;
    const status = !configured ? 'not_configured' : outcome !== 'success' ? 'failed' : !current ? 'missing_current_snapshot' : 'ok';
    sources[name] = { status, outcome, collectedAt: latest?.collectedAt || null,
      snapshotDate: latest?.snapshotDate || null, startDate: latest?.startDate || null, endDate: latest?.endDate || null,
      currentRunSnapshot: Boolean(current), corruptSnapshotObserved: corrupt,
      critical: !['buffer', 'ga4-admin', 'search-growth'].includes(name) && configured };
  }
  for (const [name, key] of [['bing-acceptance', 'BING_ACCEPTANCE'], ['blog-health', 'BLOG_HEALTH']]) {
    sources[name] = { status: env[`${key}_OUTCOME`] === 'success' ? 'ok' : 'failed', outcome: env[`${key}_OUTCOME`] || 'unknown', critical: true };
  }
  const failed = Object.values(sources).some(s => s.critical && s.status !== 'ok');
  return { version: 1, runId: env.GITHUB_RUN_ID, startedAt: env.COLLECTION_STARTED_AT,
    generatedAt: new Date(now).toISOString(), status: failed ? 'failed' : Object.values(sources).some(s => s.status !== 'ok') ? 'degraded' : 'healthy', sources };
}

async function main() {
  const root = path.resolve('data');
  const file = path.join(root, 'collection-status.json');
  if (process.argv.includes('--summarize')) {
    const report = JSON.parse(await fs.readFile(file, 'utf8'));
    if (report.runId !== process.env.GITHUB_RUN_ID) throw new Error('Current run status unavailable; refusing previous run evidence.');
    const text = [`## SEO collection: ${report.status}`, '', '| Source | Status | Step outcome | Last collected (UTC) |', '| --- | --- | --- | --- |',
      ...Object.entries(report.sources).map(([name, s]) => `| ${name} | ${s.status} | ${s.outcome} | ${s.collectedAt || 'unknown'} |`), '', 'Degraded is partial collection, not full business success. Prior valid snapshots are retained.'].join('\n');
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, text + '\n');
    console.log(text);
    if (report.status === 'degraded') console.log('::warning::SEO collection degraded; inspect per-source status before using data.');
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `failed=${report.status === 'failed' ? '1' : '0'}\n`);
  } else {
    const report = await collectionStatus(path.join(root, 'raw'), process.env);
    await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n');
    console.log(`SEO_COLLECTION_STATUS ${report.status}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
