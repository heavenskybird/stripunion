import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { admission, claim, validateManifest, seedReceipt, stateStore, STATE_BRANCH } from '../editorial-r1-runtime.mjs';
import { normalizeUrls, classifyStatus, waitForAllLive, probeDeployment } from '../check-live-publications.mjs';
import { guideFingerprints } from '../publication-deployment.mjs';

const slugs = ['a', 'b', 'c', 'd', 'e'];
const urls = slugs.map((slug) => `https://stripunion.com/guides/${slug}`);
const hashes = Object.fromEntries(slugs.map((slug) => [slug, 'a'.repeat(64)]));
const epoch = Date.parse('2026-10-11T00:00:00Z');

async function verify({ statuses = [200], markers = ['matched'], maxAttempts = 5, deadlineMs = 1000 } = {}) {
  let clock = 0, probes = 0, markerProbes = 0;
  const result = await waitForAllLive(urls, {
    expectedGuides: hashes, maxAttempts, deadlineMs, intervalMs: 10,
    now: () => clock, sleepImpl: async (ms) => { clock += ms; },
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, 'manual');
      if (url.endsWith('/publication-deployment.json')) {
        const marker = markers[Math.min(markerProbes++, markers.length - 1)];
        if (typeof marker === 'number') return new Response('', { status: marker });
        if (marker === 'invalid') return new Response('{', { status: 200 });
        return Response.json({ version: 1, guides: marker === 'matched' ? hashes : {} });
      }
      const round = Math.floor(probes++ / 5);
      const status = statuses[Math.min(round, statuses.length - 1)];
      if (status === 0) throw new Error('secret-like https://user:password@host');
      return new Response('', { status });
    },
  });
  return { ...result, probes, markerProbes };
}

test('missed cron: next wakeup admits one current batch, never catches up multiple hours', () => {
  const state = { ...claim(null, '1', epoch), status: 'success' };
  assert.equal(admission(state, { now: epoch + 4 * 3600_000, runId: '2' }).action, 'claim');
  const next = claim(state, '2', epoch + 4 * 3600_000);
  assert.equal(admission(next, { now: epoch + 4 * 3600_000 + 1, runId: '3' }).action, 'skip');
});

test('duplicate multi-source/manual wakeups and historical reruns cannot bypass admission', () => {
  const state = claim(null, '12', epoch);
  assert.equal(admission(state, { now: epoch + 24 * 3600_000, runId: '12' }).reason, 'duplicate-run');
  assert.equal(admission(state, { now: epoch, runId: '13' }).action, 'skip');
  assert.equal(admission(null, { runId: '14', runAttempt: 2 }).reason, 'historical-rerun-refused');
});

test('success keeps 52-minute cadence; crash/failure recovery has 10-minute backoff and three-cycle ceiling', () => {
  let state = { ...claim(null, '1', epoch), status: 'success' };
  assert.equal(admission(state, { now: epoch + 51 * 60_000, runId: '2' }).action, 'skip');
  assert.equal(admission(state, { now: epoch + 52 * 60_000, runId: '2' }).action, 'claim');
  state = claim(null, '1', epoch);
  assert.equal(admission(state, { now: epoch + 9 * 60_000, runId: '2' }).action, 'skip');
  for (const id of ['2', '3']) {
    const now = Date.parse(state.startedAt) + 10 * 60_000;
    assert.equal(admission(state, { now, runId: id }).action, 'claim');
    state = claim(state, id, now);
  }
  assert.equal(admission(state, { now: epoch + 24 * 3600_000, runId: '4' }).reason, 'cycle-retry-limit');
});

test('bad receipt fails closed rather than becoming due', () => {
  assert.throws(() => admission({ status: 'success' }, { runId: '2' }), /Invalid/);
  const state = claim(null, '1', epoch);
  assert.throws(() => admission(state, { now: epoch - 1, runId: '2' }), /future/);
});

test('legacy migration respects the latest real Producer and excludes the current manual run', () => {
  const state = seedReceipt([
    { id: 2, created_at: new Date(epoch + 1000).toISOString(), status: 'in_progress' },
    { id: 1, created_at: new Date(epoch).toISOString(), status: 'completed', conclusion: 'success' },
  ], '2');
  assert.equal(state.runId, '1');
  assert.equal(admission(state, { now: epoch + 1000, runId: '2' }).action, 'skip');
});

test('concurrent stale state stores: one CAS claim succeeds, the other fails, fresh read deduplicates', async () => {
  let current = { ...claim(null, '1', epoch), status: 'success' }, revision = 'v1';
  const calls = [];
  const fakeApi = (url, method = 'GET', body) => {
    calls.push({ url, method });
    if (url.includes('/branches?')) return [[{ name: STATE_BRANCH }]];
    if (url.includes('/git/ref/')) return { object: { sha: 'state-commit' } };
    if (url.includes('/git/trees/')) return { tree: [{ path: 'ops/control-plane/editorial-r1-receipt.json' }] };
    if (method === 'PUT') {
      assert.equal(body.branch, STATE_BRANCH);
      if (body.sha !== revision) throw new Error('409 conflict');
      current = JSON.parse(Buffer.from(body.content, 'base64').toString());
      revision = 'v2';
      return {};
    }
    return { sha: revision, content: Buffer.from(JSON.stringify(current)).toString('base64') };
  };
  const options = { repo: 'heavenskybird/stripunion', runId: '2', apiImpl: fakeApi };
  const [a, b] = await Promise.all([stateStore(options), stateStore(options)]);
  const now = epoch + 60 * 60_000;
  a.write(claim(a.state, '2', now));
  assert.throws(() => b.write(claim(b.state, '3', now)), /409/);
  const fresh = await stateStore(options);
  assert.equal(admission(fresh.state, { now, runId: '3' }).action, 'skip');
  assert.ok(calls.every((row) => !row.url.endsWith('/git/refs')));
  await assert.rejects(() => stateStore({ ...options, repo: 'other/repo' }), /non-canonical/);
});

test('GitHub API failure or truncated tree never permits generation', async () => {
  await assert.rejects(() => stateStore({ repo: 'heavenskybird/stripunion', apiImpl: () => { throw new Error('403'); } }), /403/);
  await assert.rejects(() => stateStore({ repo: 'heavenskybird/stripunion', apiImpl: (url) =>
    url.includes('/branches?') ? [[{ name: STATE_BRANCH }]] : url.includes('/git/ref/') ?
      { object: { sha: 'state-commit' } } : { truncated: true } }), /Truncated/);
});

test('exact five unique URLs and fingerprints are mandatory', async () => {
  assert.throws(() => normalizeUrls(urls.slice(0, 4)), /five/);
  assert.throws(() => normalizeUrls(Array(5).fill(urls[0])), /unique/);
  for (const url of ['https://other.example/guides/e', 'https://stripunion.com/guides/e?key=secret',
    'https://user:password@stripunion.com/guides/e']) {
    assert.throws(() => normalizeUrls([...urls.slice(0, 4), url]), /Refused/);
  }
  await assert.rejects(() => waitForAllLive(urls), /fingerprints/);
});

for (const status of [401, 403, 302, 410]) {
  test(`HTTP ${status} is terminal and never publication success`, async () => {
    const result = await verify({ statuses: [status, 200] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'terminal-http-status');
    assert.equal(result.evidence.length, 1);
  });
}

for (const status of [404, 429, 500, 503, 0]) {
  test(`HTTP ${status} retries remain bounded; persistent error cannot become published`, async () => {
    const result = await verify({ statuses: [status], maxAttempts: 3 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'attempt-limit');
    assert.equal(result.probes, 15);
    assert.equal(result.evidence.length, 3);
    assert.ok(!JSON.stringify(result).includes('password'));
    assert.ok(!JSON.stringify(result).includes('secret-like'));
  });
}

test('deployment delay: 404 then 503 then all HTTP 200 + matching build evidence recovers', async () => {
  const result = await verify({ statuses: [404, 503, 200], markers: ['stale', 'stale', 'matched'] });
  assert.equal(result.ok, true);
  assert.equal(result.evidence.length, 3);
  assert.equal(result.deployment.classification, 'deployment-matched');
});

test('one forbidden guide blocks the other four live guides and a matching deployment', async () => {
  const result = await waitForAllLive(urls, { expectedGuides: hashes, fetchImpl: async (url) =>
    url.endsWith('/publication-deployment.json') ? Response.json({ version: 1, guides: hashes }) :
      new Response('', { status: url === urls[4] ? 403 : 200 }) });
  assert.equal(result.ok, false);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.results.filter((row) => row.ok).length, 4);
});

test('real request timeout cannot be mistaken for a live page', async () => {
  const result = await waitForAllLive(urls, { expectedGuides: hashes, maxAttempts: 1, requestTimeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      const keeper = setTimeout(() => reject(new Error('fixture did not abort')), 100);
      signal.addEventListener('abort', () => { clearTimeout(keeper); reject(signal.reason); }, { once: true });
    }) });
  assert.equal(result.ok, false);
  assert.equal(result.results[0].error, 'TimeoutError');
  assert.equal(result.reason, 'attempt-limit');
});

test('all HTTP 200 with stale/malformed/missing/forbidden deployment evidence fails closed', async () => {
  for (const marker of ['stale', 'invalid', 404, 403]) {
    const result = await verify({ markers: [marker], maxAttempts: 2 });
    assert.equal(result.ok, false);
    assert.ok(result.results.every((row) => row.status === 200));
  }
});

test('deadline is separate from retry count and sleep is clipped to remaining time', async () => {
  const result = await verify({ statuses: [404], maxAttempts: 40, deadlineMs: 11 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'deadline');
  assert.equal(result.evidence.length, 2);
});

test('invalid retry configuration is rejected; zero/negative/infinite loops cannot start', async () => {
  for (const options of [{ maxAttempts: 0 }, { maxAttempts: 41 }, { deadlineMs: Infinity }, { intervalMs: -1 }]) {
    await assert.rejects(() => waitForAllLive(urls, { expectedGuides: hashes, ...options }), /Invalid/);
  }
});

test('oversized deployment marker is rejected and never logged', async () => {
  const result = await probeDeployment(hashes, 1000, async () => new Response('x'.repeat(512_001)));
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'deployment-unavailable');
  assert.ok(JSON.stringify(result).length < 150);
});

test('checkpoint and partial Ledger closure restore the exact five; repeat Ledger writes preserve evidence', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stripunion-r1-'));
  const manifest = { count: 5, guideFiles: slugs.map((s) => `src/data/guides/${s}.js`),
    artifactFiles: slugs.map((s) => `ops/editorial/content-artifacts/${s}.json`) };
  const runtime = path.resolve('scripts/editorial-r1-runtime.mjs');
  const ledger = path.resolve('scripts/record-astro-publication.mjs');
  const manifestPath = path.join(dir, 'manifest.json');
  const env = { ...process.env, R1_MANIFEST_PATH: manifestPath, R1_CYCLE_ID: 'fixture' };
  try {
    await fs.writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
    for (const file of [...manifest.guideFiles, ...manifest.artifactFiles]) {
      await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      const slug = path.basename(file, path.extname(file));
      await fs.writeFile(path.join(dir, file), file.endsWith('.js') ?
        `export default {slug:'${slug}',categorySlug:'test',title:'Test'};` : '{}');
    }
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    execFileSync(process.execPath, [runtime, 'checkpoint'], { cwd: dir, env });
    execFileSync(process.execPath, [ledger, manifest.guideFiles[0], 'distributed'], { cwd: dir, env });
    const ledgerPath = path.join(dir, 'ops/editorial/publication-ledger/astro/a.json');
    const before = await fs.readFile(ledgerPath, 'utf8');
    execFileSync(process.execPath, [runtime, 'restore'], { cwd: dir, env });
    const restored = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    assert.deepEqual(restored.guideFiles, manifest.guideFiles);
    assert.equal(restored.generatedCount, 0);
    execFileSync(process.execPath, [ledger, manifest.guideFiles[0], 'distribution_pending'], { cwd: dir, env });
    assert.equal(await fs.readFile(ledgerPath, 'utf8'), before);
    execFileSync(process.execPath, [ledger, manifest.guideFiles[1], 'distribution_pending'], { cwd: dir, env });
    const bLedger = path.join(dir, 'ops/editorial/publication-ledger/astro/b.json');
    const pending = JSON.parse(await fs.readFile(bLedger));
    execFileSync(process.execPath, [ledger, manifest.guideFiles[1], 'distributed'], { cwd: dir, env });
    const completed = JSON.parse(await fs.readFile(bLedger));
    assert.equal(completed.distribution_state, 'distributed');
    assert.equal(completed.published_at, pending.published_at);
    execFileSync(process.execPath, [runtime, 'clear'], { cwd: dir, env });
    execFileSync(process.execPath, [runtime, 'restore'], { cwd: dir, env });
    assert.equal(JSON.parse(await fs.readFile(manifestPath, 'utf8')).phase, 'closed');
    await fs.rm(manifestPath);
    execFileSync(process.execPath, [runtime, 'restore'], { cwd: dir, env: { ...env, R1_CYCLE_ID: 'next-cycle' } });
    await assert.rejects(() => fs.access(manifestPath));
    await fs.rm(path.join(dir, manifest.guideFiles[4]));
    assert.throws(() => execFileSync(process.execPath, [runtime, 'restore'], { cwd: dir, env, stdio: 'pipe' }));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('checkpoint rejects partial/duplicate/traversal identities', () => {
  const data = { count: 5, guideFiles: slugs.map((s) => `src/data/guides/${s}.js`),
    artifactFiles: slugs.map((s) => `ops/editorial/content-artifacts/${s}.json`) };
  assert.equal(validateManifest(data), data);
  assert.throws(() => validateManifest({ ...data, count: 4 }));
  assert.throws(() => validateManifest({ ...data, guideFiles: Array(5).fill(data.guideFiles[0]) }));
  assert.throws(() => validateManifest({ ...data, guideFiles: ['../secret', ...data.guideFiles.slice(1)] }));
});

test('build fingerprints track actual content bytes', async () => {
  const files = ['src/data/guides/adult-affiliate-webmaster-program-evaluation-guide.js'];
  const result = await guideFingerprints(files);
  assert.match(result['adult-affiliate-webmaster-program-evaluation-guide'], /^[a-f0-9]{64}$/);
  await assert.rejects(() => guideFingerprints(['../secret']), /Invalid/);
});

test('workflow contract: reusable call, shared non-cancelling writer, gated side effects and no Producer dispatch', async () => {
  const scheduler = await fs.readFile('.github/workflows/editorial-producer-scheduler.yml', 'utf8');
  const producer = await fs.readFile('.github/workflows/editorial-hourly-producer.yml', 'utf8');
  assert.ok(scheduler.includes('uses: ./.github/workflows/editorial-hourly-producer.yml'));
  assert.ok(!scheduler.includes('gh workflow run') && !scheduler.includes('/dispatches'));
  assert.ok(scheduler.includes('cancel-in-progress: false'));
  assert.ok(scheduler.includes("github.event.workflow_run.event != 'pull_request'"));
  assert.ok(producer.includes('workflow_call:') && producer.includes('group: editorial-hourly-producer'));
  assert.ok(producer.includes("EDITORIAL_BATCH_SIZE: '5'"));
  const afterAdmission = producer.split('      - name: Install dependencies')[1];
  for (const step of ('      - name: Install dependencies' + afterAdmission).split('      - name: ').filter(Boolean)) {
    assert.ok(step.includes("steps.admission.outputs.claimed == 'true'"), step.split('\n')[0]);
  }
  assert.ok(producer.indexOf('node scripts/check-live-publications.mjs\n') < producer.indexOf('node scripts/record-astro-publication.mjs'));
  assert.equal(classifyStatus(204), 'unexpected-status');
});
