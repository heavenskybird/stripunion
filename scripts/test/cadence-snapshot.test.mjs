import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCadenceSnapshot } from '../cadence-github-snapshot.mjs';
test('independent collector makes GET requests only, tracks unknown inventory and redacts tokens', async () => {
  const methods = [];
  const fetchImpl = async (url, options) => {
    methods.push(options.method);
    const path = new URL(url).pathname;
    const query = new URL(url).search;
    let data;
    if (path.endsWith('/stripunion/')) data = { default_branch: 'main' };
    else if (path.includes('/contents/')) data = { sha: 'a'.repeat(40), content: Buffer.from(JSON.stringify({ version: 1, status: 'success' })).toString('base64') };
    else if (path.endsWith('/runs') && query.includes('status=')) data = { total_count: 101, workflow_runs: [] };
    else if (path.endsWith('/runs')) data = { total_count: 500, workflow_runs: [{ id: 1, event: 'schedule', actor: { login: 'actor' }, created_at: '2026-11-12T00:00:00Z' }] };
    else data = { state: 'active' };
    return { ok: true, json: async () => data };
  };
  const report = await collectCadenceSnapshot({ token: 'private-test-token', fetchImpl, now: 0 });
  assert.ok(methods.every(m => m === 'GET'));
  assert.equal(report.inventoryComplete, false);
  assert.equal(report.schedulerRuns[0].actor, 'actor');
  assert.ok(!JSON.stringify(report).includes('private-test-token'));
});
test('denied read fails closed without raw error body or dispatch fallback', async () => {
  await assert.rejects(collectCadenceSnapshot({ token: 'secret', fetchImpl: async () => ({ ok: false, status: 403 }) }), /CADENCE_READ_HTTP_403/);
});
