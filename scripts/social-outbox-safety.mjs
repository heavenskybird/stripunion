import { createHash } from 'node:crypto';
export const RUNTIME_BRANCH = 'codex/social-outbox-runtime';
export function validateCap(value, maximum) {
  const cap = Number(value);
  if (!Number.isInteger(cap) || cap < 0 || cap > maximum) throw new Error('Invalid social cap; refusing sends.');
  return cap;
}
export function wakeDecision(runs, now = Date.now()) {
  if (!Array.isArray(runs) || !runs.length) return { action: 'blocked', reason: 'missing-run-evidence' };
  const canonical = runs.filter(r => r.head_branch === 'main');
  if (canonical.some(r => r.status !== 'completed')) return { action: 'skip', reason: 'active-writer' };
  const last = canonical.sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at))[0];
  const age = now - Date.parse(last?.updated_at || last?.created_at);
  if (!Number.isFinite(age) || age < 0) return { action: 'blocked', reason: 'invalid-run-evidence' };
  if (age < 30 * 60_000) return { action: 'skip', reason: 'fresh', ageMs: age };
  // Repeated failures require investigation, not an unbounded retry loop.
  if (canonical.slice(0,3).length === 3 && canonical.slice(0,3).every(r => r.conclusion !== 'success')) {
    return { action: 'blocked', reason: 'repeated-failure' };
  }
  return { action: 'wake', reason: 'stale-30-minutes', ageMs: age };
}
export function providerDayUsage(posts, events, dueDay, dayKey) {
  const ids = new Set(posts.filter(post => dayKey(post.sentAt || post.dueAt) === dueDay).map(post => String(post.id)));
  for (const event of events) {
    if (event.channel === 'x' && ['scheduled', 'delivered'].includes(event.state) && dayKey(event.provider_due_at) === dueDay) {
      ids.add(event.provider_message_id ? String(event.provider_message_id) : `local:${event.idempotency_key}`);
    }
  }
  return ids.size;
}
export async function githubApi(endpoint, method = 'GET', body) {
  if (process.env.GITHUB_REPOSITORY !== 'heavenskybird/stripunion' || !process.env.GH_TOKEN) throw new Error('Canonical GitHub runtime authorization required.');
  const response = await fetch(`https://api.github.com/repos/heavenskybird/stripunion/${endpoint}`, {
    method, headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000)
  });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) throw new Error(`Social runtime API ${method} failed (${response.status}); fail closed.`);
  return response.status === 204 ? null : response.json();
}
export async function journal(event, api = githubApi) {
  if (!event.idempotency_key) throw new Error('Missing outbox identity.');
  // Branch must be provisioned at acceptance; never initialize from an empty/error response.
  if (!await api(`branches/${encodeURIComponent(RUNTIME_BRANCH)}`)) throw new Error('Missing isolated social runtime branch.');
  const digest = createHash('sha256').update(event.idempotency_key).digest('hex');
  const endpoint = `contents/ops/control-plane/social-attempts/${digest}.json`;
  let file = await api(`${endpoint}?ref=${encodeURIComponent(RUNTIME_BRANCH)}`);
  const state = file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : null;
  return { state, async write(value) {
    const result = await api(endpoint, 'PUT', { branch: RUNTIME_BRANCH, message: 'ops: persist social attempt journal [skip ci]',
      content: Buffer.from(JSON.stringify(value, null, 2)+'\n').toString('base64'), ...(file ? { sha: file.sha } : {}) });
    if (!result?.content?.sha) throw new Error('Unconfirmed social journal write.');
    file = result.content;
  } };
}
export async function deliverOnce(event, send, store, now = Date.now()) {
  if (!['pending', 'retryable'].includes(event.state)) return { held: true };
  if (store.state) return { held: true, receipt: store.state };
  // Legacy retryable attempts may already exist at the provider.
  if (Number(event.attempt_count || 0) > 0) return { held: true };
  const receipt = { version: 1, idempotency_key: event.idempotency_key, status: 'reconcile_required', attempted_at: new Date(now).toISOString() };
  // CAS must succeed remotely BEFORE the irreversible provider call.
  await store.write(receipt);
  let result;
  try { result = await send(); }
  catch { return { held: true, receipt }; }
  if (!result?.id || !['scheduled', 'delivered'].includes(result.state)) return { held: true, receipt };
  const confirmed = { ...receipt, status: result.state, provider_message_id: String(result.id), provider_due_at: result.dueAt || null };
  await store.write(confirmed);
  return { held: false, receipt: confirmed };
}
