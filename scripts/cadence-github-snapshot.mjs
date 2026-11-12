import { pathToFileURL } from 'node:url';

const REPO = 'heavenskybird/stripunion';
const WORKFLOW = 'editorial-producer-scheduler.yml';
// GET-only collector: usable from the existing external observer or an authorized
// local clock. It does not depend on scheduling another GitHub workflow.
export async function collectCadenceSnapshot({ token, fetchImpl = fetch, now = Date.now(), clockSource = 'external-local-clock' } = {}) {
  if (!token) throw new Error('MISSING_READ_CREDENTIAL');
  async function get(path) {
    const response = await fetchImpl(`https://api.github.com/repos/${REPO}/${path}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error(`CADENCE_READ_HTTP_${response.status}`);
    return response.json();
  }
  const [repository, workflow, receipt, runs, ...inventories] = await Promise.all([
    get(''), get(`actions/workflows/${WORKFLOW}`),
    get('contents/ops/control-plane/editorial-r1-receipt.json?ref=codex%2Feditorial-r1-runtime'),
    get(`actions/workflows/${WORKFLOW}/runs?per_page=100`),
    ...['in_progress', 'queued', 'waiting', 'pending', 'requested'].map(status => get(`actions/runs?status=${status}&per_page=100`))
  ]);
  let inventoryComplete = inventories.every(i => Number.isInteger(i.total_count) && i.total_count <= 100);
  const active = new Map(inventories.flatMap(i => i.workflow_runs || []).filter(r => r.head_branch === 'main').map(r => [r.id, r]));
  const activeRuns = [];
  for (const run of active.values()) {
    const jobs = await get(`actions/runs/${run.id}/jobs?per_page=100`);
    inventoryComplete &&= Number.isInteger(jobs.total_count) && jobs.total_count <= 100;
    activeRuns.push({ id: String(run.id), name: run.name, status: run.status, headSha: run.head_sha,
      jobCount: jobs.total_count, jobs: (jobs.jobs || []).map(j => ({ id: String(j.id), status: j.status, conclusion: j.conclusion })) });
  }
  const state = JSON.parse(Buffer.from(receipt.content, 'base64').toString('utf8'));
  return { version: 1, clockSource, repository: REPO, defaultBranch: repository.default_branch,
    observedAt: new Date(now).toISOString(), workflowState: workflow.state, receiptSha: receipt.sha,
    receipt: state, inventoryComplete, activeRuns,
    schedulerRuns: (runs.workflow_runs || []).map(r => ({ id: String(r.id), event: r.event, status: r.status,
      conclusion: r.conclusion, createdAt: r.created_at, actor: r.actor?.login || null, triggeringActor: r.triggering_actor?.login || null })),
    historyCoverage: { returned: runs.workflow_runs?.length || 0, total: runs.total_count,
      note: 'Latest 100 scheduler events; no assertion that missing events were delivered or that actor account status is known.' } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await collectCadenceSnapshot({ token: process.env.GH_TOKEN }), null, 2)); }
  catch (error) {
    const code = /^(?:MISSING_READ_CREDENTIAL|CADENCE_READ_HTTP_\d{3})$/.test(error.message) ? error.message : 'CADENCE_READ_UNAVAILABLE';
    console.error(code); process.exitCode = 1;
  }
}
