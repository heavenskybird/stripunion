import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { probeUrl, probeDeployment } from './check-live-publications.mjs';

assert.equal(process.env.GITHUB_REPOSITORY, 'heavenskybird/stripunion');
assert.equal(process.env.GITHUB_REF, 'refs/heads/codex/recovery-r1-rearm-20261112');
assert.equal(process.env.GITHUB_WORKFLOW, 'Recovery real cycle observation');
assert.equal(process.env.SOCIAL_OUTBOX_SEND_ENABLED, 'false');
const base = 'https://api.github.com/repos/heavenskybird/stripunion/';
async function api(endpoint, method = 'GET') {
  const response = await fetch(base + endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`Observation API HTTP${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function file(path, ref = 'main') {
  const data = await api(`contents/${path}?ref=${encodeURIComponent(ref)}`);
  const bytes = Buffer.from(data.content, 'base64');
  return { sha: data.sha, bytes, json: () => JSON.parse(bytes.toString('utf8')) };
}
const report = { startedAt: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID,
  accepted: [], state: 'WAITING_FOR_NATURAL_WAKE', firstFivePublished: false, threeCyclesAccepted: false };
await fs.mkdir('work/recovery', { recursive: true });
const save = () => fs.writeFile('work/recovery/cycle-observation.json', JSON.stringify(report, null, 2) + '\n');
const seenSlugs = new Set();
const seenIds = new Set();
let lastState;
try {
  const rearm = await api('actions/runs/43150236889');
  assert.equal(rearm.conclusion, 'success', 'Rearm workflow must finish successfully first');
  const baseline = Date.parse(rearm.created_at);
  for (let poll = 0; poll < 540; poll++) {
    const receiptFile = await file('ops/control-plane/editorial-r1-receipt.json', 'codex/editorial-r1-runtime');
    const receipt = receiptFile.json();
    const label = `${receipt.runId}:${receipt.status}:${receipt.attempts}`;
    report.latestReceipt = { sha: receiptFile.sha, runId: receipt.runId, cycleId: receipt.cycleId,
      attempts: receipt.attempts, status: receipt.status };
    if (label !== lastState) { console.log('R1_OBSERVATION ' + JSON.stringify(report.latestReceipt)); lastState = label; }
    if (receipt.runId !== '41260561057' && receipt.status === 'failure') {
      await api('actions/workflows/editorial-producer-scheduler.yml/disable', 'PUT');
      assert.equal((await api('actions/workflows/editorial-producer-scheduler.yml')).state, 'disabled_manually');
      report.state = 'STOPPED_AFTER_REAL_PRODUCTION_FAILURE';
      report.schedulerDisabled = true;
      await save();
      throw new Error('Real production failed; Scheduler paused, receipt retained, no retry forced');
    }
    if (receipt.status === 'success' && Date.parse(receipt.startedAt) >= baseline &&
        !report.accepted.some(c => c.cycleId === receipt.cycleId)) {
      const run = await api(`actions/runs/${receipt.runId}`);
      if (run.status !== 'completed') { await save(); await new Promise(r => setTimeout(r, 20_000)); continue; }
      assert.equal(run.conclusion, 'success');
      const manifest = (await file('ops/editorial/pending-publication-batch.json')).json();
      assert.equal(manifest.phase, 'closed');
      assert.equal(manifest.r1CycleId, receipt.cycleId);
      assert.equal(manifest.count, 5);
      assert.equal(new Set(manifest.guideFiles).size, 5);
      assert.equal(new Set(manifest.backlogIds).size, 5);
      const expected = {};
      const guides = [];
      for (let index = 0; index < 5; index++) {
        const guide = manifest.guideFiles[index];
        assert.match(guide, /^src\/data\/guides\/[a-z0-9-]+\.js$/);
        const slug = guide.split('/').at(-1).replace(/\.js$/, '');
        assert.ok(!seenSlugs.has(slug) && !seenIds.has(manifest.backlogIds[index]));
        const source = await file(guide);
        expected[slug] = createHash('sha256').update(source.bytes).digest('hex');
        const ledger = (await file(`ops/editorial/publication-ledger/astro/${slug}.json`)).json();
        assert.equal(ledger.slug, slug);
        assert.ok(Date.parse(ledger.published_at) >= baseline);
        assert.ok(Date.parse(ledger.verified_at) >= Date.parse(ledger.published_at));
        const probe = await probeUrl(`https://stripunion.com/guides/${slug}`, 15_000);
        assert.equal(probe.status, 200);
        guides.push({ slug, backlogId: manifest.backlogIds[index], sha256: expected[slug],
          sourceBlobSha: source.sha, publishedAt: ledger.published_at, verifiedAt: ledger.verified_at, probe });
      }
      const deployment = await probeDeployment(expected, 15_000, fetch);
      assert.equal(deployment.ok, true);
      const jobs = await api(`actions/runs/${receipt.runId}/jobs?per_page=100`);
      const steps = jobs.jobs.flatMap(j => j.steps || []);
      for (const name of ['Run production quality gates', 'Run visual QA on all five selected guides',
        'Wait for production and enqueue native social outbox', 'Close publication state and persist ledger']) {
        assert.ok(steps.some(s => s.name === name && s.conclusion === 'success'), `Unverified business step ${name}`);
      }
      const main = await api('commits/main');
      for (const row of guides) { seenSlugs.add(row.slug); seenIds.add(row.backlogId); }
      const accepted = { acceptedAt: new Date().toISOString(), runId: receipt.runId, cycleId: receipt.cycleId,
        receiptSha: receiptFile.sha, closureMainSha: main.sha, guides, deployment,
        usageEvidence: `https://github.com/heavenskybird/stripunion/actions/runs/${receipt.runId} (EDITORIAL_PROVIDER_USAGE and publication-verification artifact)`,
        socialSendEnabled: false };
      report.accepted.push(accepted);
      report.firstFivePublished = true;
      report.state = 'REAL_CYCLE_ACCEPTED';
      console.log('R1_REAL_CYCLE_ACCEPTED ' + JSON.stringify(accepted));
      if (report.accepted.length === 3) {
        report.threeCyclesAccepted = true;
        report.state = 'THREE_CYCLES_ACCEPTED_START_RELIABILITY_OBSERVATION';
        await save();
        break;
      }
    }
    await save();
    await new Promise(r => setTimeout(r, 20_000));
  }
  if (!report.threeCyclesAccepted) { report.state = 'OBSERVATION_WINDOW_ENDED_INCOMPLETE'; await save(); process.exitCode = 1; }
} catch (error) {
  report.error = error.message;
  await save();
  console.error('R1_OBSERVATION_STOP ' + JSON.stringify({ state: report.state, error: report.error }));
  process.exitCode = 1;
}
