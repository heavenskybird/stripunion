// Adapter for authorized GitHub connector GET results. No network or writes.
export function connectorSnapshot({ repository, receiptFile, inventories, runHistory, jobsByRun = {}, workflowMetadata = null,
  admissions = [], observedAt, clockSource = 'chatgpt-automation' }) {
  const receipt = JSON.parse(receiptFile.encoding === 'base64'
    ? Buffer.from(receiptFile.content, 'base64').toString('utf8') : receiptFile.content);
  const statuses = ['in_progress', 'queued', 'waiting', 'pending', 'requested'];
  let inventoryComplete = statuses.every(s => Number.isInteger(inventories?.[s]?.total_count) && inventories[s].total_count <= 100);
  const unique = new Map(statuses.flatMap(s => inventories?.[s]?.workflow_runs || []).filter(r => r.head_branch === 'main').map(r => [r.id, r]));
  const activeRuns = [...unique.values()].map(r => {
    const jobs = jobsByRun[String(r.id)];
    inventoryComplete &&= Number.isInteger(jobs?.total_count) && jobs.total_count <= 100;
    return { id: String(r.id), name: r.name, status: r.status, headSha: r.head_sha, jobCount: jobs?.total_count ?? null };
  });
  return { version: 1, repository: repository.full_name, defaultBranch: repository.default_branch,
    clockSource, observedAt, receiptSha: receiptFile.sha, receipt,
    workflowState: workflowMetadata?.state || 'UNKNOWN', inventoryComplete, activeRuns,
    schedulerRuns: (runHistory.workflow_runs || []).filter(r => r.name === 'Editorial producer scheduler' && r.head_branch === 'main')
      .map(r => ({ id: String(r.id), event: r.event, status: r.status, conclusion: r.conclusion, createdAt: r.created_at })), admissions };
}
export function admissionEvidence(runId, log) {
  const actions = new Set(['claim', 'skip', 'blocked']);
  const reasons = new Set(['backoff', 'duplicate-run', 'cycle-retry-limit', 'cadence-due', 'bounded-recovery', 'first-cycle', 'historical-rerun-refused']);
  const rows = [];
  for (const line of String(log || '').split('\n')) {
    const match = line.match(/Z R1_ADMISSION (\{.*\})\s*$/);
    if (!match) continue;
    try {
      const d = JSON.parse(match[1]);
      if (actions.has(d.action)) rows.push({ runId: String(runId), action: d.action,
        reason: reasons.has(d.reason) ? d.reason : 'UNKNOWN', ...(Number.isSafeInteger(d.remainingMs) ? { remainingMs: d.remainingMs } : {}) });
    } catch {}
  }
  return rows;
}
