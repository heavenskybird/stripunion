import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function minimalRearm(raw) {
  const before = JSON.parse(raw);
  assert.equal(before.version, 1);
  assert.equal(before.status, 'failure');
  assert.equal(before.cycleId, '41254032304');
  assert.equal(before.runId, '41260561057');
  assert.equal(before.attempts, 3);
  assert.equal(before.recentRunIds.length, 200);
  assert.equal(before.recentRunIds.at(-1), before.runId);
  const matches = [...raw.matchAll(/"attempts"\s*:\s*3(?=\s*[,}])/g)];
  assert.equal(matches.length, 1);
  const afterRaw = raw.replace(/("attempts"\s*:\s*)3(?=\s*[,}])/, '$11');
  const after = JSON.parse(afterRaw);
  assert.equal(after.attempts, 1);
  assert.deepEqual({ ...after, attempts: 3 }, before);
  return afterRaw;
}

async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY, 'heavenskybird/stripunion');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/codex/recovery-r1-rearm-20261112');
  assert.equal(process.env.GITHUB_WORKFLOW, 'Recovery controlled R1 rearm');
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1');
  assert.equal(process.env.SOCIAL_OUTBOX_SEND_ENABLED, 'false');
  const base = 'https://api.github.com/repos/heavenskybird/stripunion/';
  async function api(endpoint, method = 'GET', body) {
    const response = await fetch(base + endpoint, { method, redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`R1_CONTROL_API_REFUSED HTTP${response.status} method=${method}`);
    return response.status === 204 ? null : response.json();
  }
  const gate = JSON.parse(await fs.readFile('work/recovery/production-gate.json', 'utf8'));
  assert.ok(Date.now() - Date.parse(gate.checkedAt) < 300_000, 'Production proof must be fresh');
  assert.ok(Object.values(gate.gates).every(v => v === true), 'All Gate A and frozen-control assertions required');
  assert.equal(gate.manifest.phase, 'closed');
  assert.equal(gate.manifest.cycleId, '41249384691');
  const manifest = JSON.parse(await fs.readFile('ops/editorial/pending-publication-batch.json', 'utf8'));
  assert.equal(new Set(manifest.backlogIds).size, 5);
  for (const file of manifest.guideFiles) {
    const slug = file.split('/').at(-1).replace(/\.js$/, '');
    const ledger = JSON.parse(await fs.readFile(`ops/editorial/publication-ledger/astro/${slug}.json`, 'utf8'));
    assert.equal(ledger.slug, slug);
    assert.ok(Date.parse(ledger.verified_at) >= Date.parse(ledger.published_at));
  }
  const head = await api('commits/main');
  const ancestry = await api('compare/208eb5804b15610903ee2da00ad609f1f9927bda...main');
  assert.ok(['ahead', 'identical'].includes(ancestry.status), 'Reviewed usage fix must be on main');
  const builds = await api(`actions/runs?head_sha=${head.sha}&per_page=100`);
  assert.ok(builds.workflow_runs.some(r => r.name === 'Build' && r.conclusion === 'success'), 'Current main CI must pass');
  const probe = await api('actions/runs/43149522338');
  assert.equal(probe.conclusion, 'success');
  assert.ok(Date.now() - Date.parse(probe.updated_at) < 3_600_000, 'Credential verification must be under one hour old');
  const schedulerPath = 'actions/workflows/editorial-producer-scheduler.yml';
  assert.equal((await api(schedulerPath)).state, 'disabled_manually');
  const writerAudit = [];
  for (const status of ['in_progress', 'queued', 'waiting', 'pending', 'requested']) {
    const inventory = await api(`actions/runs?status=${status}&per_page=100`);
    assert.ok(inventory.total_count <= 100, 'Incomplete active run inventory');
    for (const run of inventory.workflow_runs.filter(r => r.head_branch === 'main')) {
      const jobs = await api(`actions/runs/${run.id}/jobs?per_page=100`);
      const staleZeroJob = [37655513979, 37655528917].includes(run.id) && jobs.total_count === 0 && run.head_sha === '710276134f67023864e4e83992cf46080a1c43d8';
      const readOnly = ['Build', 'Visual QA', 'Ecosystem public health', 'Editorial production snapshot', 'Hostinger Read-only Acceptance'].includes(run.name);
      writerAudit.push({ id: run.id, name: run.name, status: run.status, jobCount: jobs.total_count, staleZeroJob, readOnly });
      assert.ok(staleZeroJob || readOnly, `Conflicting/unknown writer ${run.id}; drain before rearm`);
    }
  }
  // The Actions job owns editorial-hourly-producer concurrency throughout CAS and enable.
  const receiptPath = 'contents/ops/control-plane/editorial-r1-receipt.json';
  const receiptRef = receiptPath + '?ref=codex%2Feditorial-r1-runtime';
  const fresh = await api(receiptRef);
  assert.equal(fresh.sha, '8f204ec0fe1477f9c3627b75d3d692506e47d4e4', 'Receipt changed since inspected incident; stop');
  const raw = Buffer.from(fresh.content, 'base64').toString('utf8');
  const replacement = minimalRearm(raw);
  const audit = { checkedAt: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID,
    mainSha: head.sha, productionBuild: gate.hostinger.latestBuild, writersDrained: true, writerAudit,
    receiptBeforeSha: fresh.sha, receiptAfterSha: null, receiptRearmed: false, schedulerEnabled: false,
    cycleId: JSON.parse(raw).cycleId, preservedHistoryHash: createHash('sha256').update(JSON.stringify(JSON.parse(raw).recentRunIds)).digest('hex'),
    limits: { requestsPerGeneration: 3, outputTokensPerRequest: 20_000, extraAdmittedAttempts: 2,
      remainingCredit: 'NOT_EXPOSED_TO_PROJECT_KEY', dollarEstimate: 'UNAVAILABLE_WITHOUT_VERIFIED_MODEL_PRICING',
      note: 'Each five-guide batch is bounded; no paid retry of historical runs. Responses API usage will be recorded.' } };
  const auditFile = 'work/recovery/r1-rearm.json';
  const save = () => fs.writeFile(auditFile, JSON.stringify(audit, null, 2) + '\n');
  await save();
  assert.equal((await api(receiptRef)).sha, fresh.sha);
  assert.equal((await api(schedulerPath)).state, 'disabled_manually');
  const result = await api(receiptPath, 'PUT', {
    branch: 'codex/editorial-r1-runtime', sha: fresh.sha,
    message: 'ops: controlled R1 attempts 3 to 1 after production acceptance; preserve failed cycle and all history',
    content: Buffer.from(replacement).toString('base64')
  });
  audit.receiptAfterSha = result.content.sha;
  audit.receiptCommitSha = result.commit.sha;
  await save();
  const verified = await api(receiptRef);
  assert.equal(verified.sha, audit.receiptAfterSha);
  assert.equal(Buffer.from(verified.content, 'base64').toString('utf8'), replacement);
  audit.receiptRearmed = true;
  await save();
  await api(schedulerPath + '/enable', 'PUT');
  assert.equal((await api(schedulerPath)).state, 'active');
  audit.schedulerEnabled = true;
  await save();
  console.log('R1_CONTROLLED_REARM ' + JSON.stringify(audit));
  // No dispatch, old-run rerun, kick commit, content write, or social send.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
