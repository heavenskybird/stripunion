import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const STATE_BRANCH = 'codex/editorial-r1-runtime';
const STATE_FILE = 'ops/control-plane/editorial-r1-receipt.json';
export const CHECKPOINT = 'ops/editorial/pending-publication-batch.json';
export const MANIFEST = process.env.R1_MANIFEST_PATH || '/tmp/stripunion-editorial-batch.json';

// Actions concurrency owns the lock. This receipt is durable admission/audit evidence,
// never a Supabase lease or a content planning authority.
export function admission(state, { now = Date.now(), runId, runAttempt = 1 } = {}) {
  if (runAttempt !== 1) return { action: 'skip', reason: 'historical-rerun-refused' };
  if (!state) return { action: 'claim', reason: 'first-cycle' };
  if (state.version !== 1 || !['running', 'success', 'failure'].includes(state.status) ||
      !Number.isInteger(state.attempts) || state.attempts < 1 || !Array.isArray(state.recentRunIds) ||
      state.recentRunIds.length > 200 || !state.recentRunIds.every((id) => /^\d+$/.test(id)) ||
      !/^\d+$/.test(state.runId || '') || (state.cycleId && !/^\d+$/.test(state.cycleId))) {
    throw new Error('Invalid R1 receipt; refusing admission.');
  }
  if (state.recentRunIds.includes(String(runId))) return { action: 'skip', reason: 'duplicate-run' };
  const age = now - Date.parse(state.startedAt);
  if (!Number.isFinite(age) || age < 0) throw new Error('Invalid/future R1 receipt timestamp.');
  if (state.status !== 'success' && state.attempts >= 3) {
    return { action: 'blocked', reason: 'cycle-retry-limit', attempts: state.attempts };
  }
  const delay = state.status === 'success' ? 52 * 60_000 : 10 * 60_000;
  return age >= delay ? { action: 'claim', reason: state.status === 'success' ? 'cadence-due' : 'bounded-recovery' }
    : { action: 'skip', reason: 'backoff', remainingMs: delay - age };
}

export function claim(state, runId, now = Date.now()) {
  return {
    version: 1, runId: String(runId), startedAt: new Date(now).toISOString(), status: 'running',
    cycleId: state && state.status !== 'success' ? (state.cycleId || state.runId) : String(runId),
    attempts: state && state.status !== 'success' ? state.attempts + 1 : 1,
    recentRunIds: [...(state?.recentRunIds || []), String(runId)].slice(-200),
  };
}

export function validateManifest(data) {
  if (data?.count !== 5 || !Array.isArray(data.artifactFiles) || !Array.isArray(data.guideFiles) ||
      data.artifactFiles.length !== 5 || data.guideFiles.length !== 5 ||
      new Set(data.guideFiles).size !== 5 || new Set(data.artifactFiles).size !== 5) {
    throw new Error('Expected an isolated, unique five-item checkpoint.');
  }
  for (const [i, file] of data.guideFiles.entries()) {
    if (!/^src\/data\/guides\/[a-z0-9-]+\.js$/.test(file) ||
        !/^ops\/editorial\/content-artifacts\/[a-z0-9-]+\.json$/.test(data.artifactFiles[i])) {
      throw new Error('Invalid checkpoint path.');
    }
  }
  return data;
}

export function seedReceipt(runs, currentRunId) {
  const previous = runs.filter((row) => String(row.id) !== String(currentRunId))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (!previous.length) return null;
  const row = previous[0];
  const status = row.status !== 'completed' ? 'running' : row.conclusion === 'success' ? 'success' : 'failure';
  const failures = previous.findIndex((run) => run.conclusion === 'success');
  return { version: 1, runId: String(row.id), startedAt: row.created_at, status,
    attempts: status === 'success' ? 1 : Math.max(1, Math.min(3, failures < 0 ? previous.length : failures)),
    recentRunIds: previous.map((run) => String(run.id)), migratedFromLegacy: true };
}

function api(endpoint, method = 'GET', body, paginate = false) {
  try {
    return JSON.parse(execFileSync('gh', ['api', endpoint, '--method', method,
      '-H', 'X-GitHub-Api-Version: 2022-11-28', ...(body ? ['--input', '-'] : []),
      ...(paginate ? ['--paginate', '--slurp'] : [])],
    { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 }));
  } catch { throw new Error('R1 GitHub state API failed; admission/receipt fails closed (inspect Actions permissions).'); }
}

export async function stateStore({ repo = process.env.GITHUB_REPOSITORY,
  runId = process.env.GITHUB_RUN_ID, apiImpl = api } = {}) {
  if (repo !== 'heavenskybird/stripunion') throw new Error('Refused non-canonical runtime repository.');
  const base = `/repos/${repo}`;
  // No missing-file/error ambiguity: a successful branch inventory proves absence.
  const branches = apiImpl(`${base}/branches?per_page=100`, 'GET', undefined, true).flat();
  if (!branches.some((row) => row.name === STATE_BRANCH)) {
    const main = apiImpl(`${base}/git/ref/heads/main`);
    apiImpl(`${base}/git/refs`, 'POST', { ref: `refs/heads/${STATE_BRANCH}`, sha: main.object.sha });
  }
  const ref = apiImpl(`${base}/git/ref/heads/${STATE_BRANCH}`);
  const tree = apiImpl(`${base}/git/trees/${ref.object.sha}?recursive=1`);
  if (tree.truncated) throw new Error('Truncated state tree; refusing admission.');
  const exists = tree.tree.some((row) => row.path === STATE_FILE);
  const file = exists ? apiImpl(`${base}/contents/${STATE_FILE}?ref=${encodeURIComponent(STATE_BRANCH)}`) : null;
  const state = file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) :
    seedReceipt(apiImpl(`${base}/actions/workflows/editorial-hourly-producer.yml/runs?branch=main&per_page=20`).workflow_runs, runId);
  return { state, initialized: Boolean(file), write: (value) => apiImpl(`${base}/contents/${STATE_FILE}`, 'PUT', {
    branch: STATE_BRANCH, message: 'ops: record R1 producer admission [skip ci]',
    content: Buffer.from(JSON.stringify(value, null, 2) + '\n').toString('base64'),
    ...(file ? { sha: file.sha } : {}),
  }) };
}

async function main() {
  const command = process.argv[2];
  if (command === 'restore') {
    try {
      const data = validateManifest(JSON.parse(await fs.readFile(CHECKPOINT, 'utf8')));
      if (data.phase === 'closed' && data.r1CycleId !== process.env.R1_CYCLE_ID) {
        console.log('R1_PREVIOUS_CLOSED_BATCH skipped for new cadence cycle');
        return;
      }
      for (const file of [...data.artifactFiles, ...data.guideFiles]) await fs.access(file);
      await fs.writeFile(MANIFEST, JSON.stringify({ ...data, mode: 'recovery', recoveryCount: 5, generatedCount: 0 }));
      console.log('R1_EXACT_BATCH_RESTORED');
    } catch (error) { if (error.code !== 'ENOENT') throw error;
      // Only absent checkpoint is optional; absent referenced content must fail closed.
      try { await fs.access(CHECKPOINT); } catch { return; }
      throw error;
    }
    return;
  }
  if (command === 'checkpoint') {
    const data = validateManifest(JSON.parse(await fs.readFile(MANIFEST, 'utf8')));
    if (!process.env.R1_CYCLE_ID) throw new Error('Missing R1 cycle identity.');
    await fs.writeFile(CHECKPOINT, JSON.stringify({ ...data, r1CycleId: process.env.R1_CYCLE_ID }, null, 2) + '\n');
    return;
  }
  if (command === 'clear') {
    const data = validateManifest(JSON.parse(await fs.readFile(CHECKPOINT, 'utf8')));
    await fs.writeFile(CHECKPOINT, JSON.stringify({ ...data, phase: 'closed' }, null, 2) + '\n');
    return;
  }
  const store = await stateStore();
  const runId = process.env.GITHUB_RUN_ID;
  if (!/^\d+$/.test(runId || '')) throw new Error('Missing run identity.');
  if (command === 'admit') {
    const decision = admission(store.state, { runId, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1) });
    console.log('R1_ADMISSION ' + JSON.stringify(decision));
    if (decision.action === 'blocked') throw new Error('R1 cycle retry limit reached; inspect evidence before resetting receipt.');
    if (decision.action === 'claim') {
      const receipt = claim(store.state, runId);
      store.write(receipt);
      await fs.appendFile(process.env.GITHUB_ENV, `R1_CYCLE_ID=${receipt.cycleId}\n`);
      // Keep the closed manifest until a NEW cadence cycle is durably admitted.
      // Receipt write failure after Ledger closure recovers the same five guides.
      if (store.state?.status === 'success') await fs.rm(CHECKPOINT, { force: true });
    } else if (!store.initialized && store.state) {
      store.write(store.state);
    }
    await fs.appendFile(process.env.GITHUB_OUTPUT, `claimed=${decision.action === 'claim'}\n`);
  } else if (command === 'finish') {
    if (store.state?.runId !== runId) throw new Error('Receipt owner changed; refusing overwrite.');
    const status = process.argv[3];
    if (!['success', 'failure'].includes(status)) throw new Error('Invalid completion status.');
    if (status === 'failure' && store.state.status === 'success') {
      console.log('R1_PUBLICATION_CLOSED ancillary failure does not reopen the batch');
      return;
    }
    store.write({ ...store.state, status, finishedAt: new Date().toISOString() });
  } else throw new Error('Unknown R1 command.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
