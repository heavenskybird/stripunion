import test from 'node:test';
import assert from 'node:assert/strict';
import { connectorSnapshot, admissionEvidence } from '../cadence-connector-adapter.mjs';
test('connector adapter preserves unsupported metadata and missing jobs as unknown', () => {
  const inventories = Object.fromEntries(['in_progress','queued','waiting','pending','requested'].map(s => [s, { total_count: 0, workflow_runs: [] }]));
  const input = { repository: { full_name: 'heavenskybird/stripunion', default_branch: 'main' },
    receiptFile: { sha: 'a'.repeat(40), encoding: 'utf-8', content: '{"status":"success"}' },
    inventories, runHistory: { workflow_runs: [] }, observedAt: '2026-11-12T10:00:00Z' };
  assert.equal(connectorSnapshot(input).workflowState, 'UNKNOWN');
  assert.equal(connectorSnapshot(input).inventoryComplete, true);
  inventories.queued = { total_count: 1, workflow_runs: [{ id: 1, head_branch: 'main' }] };
  assert.equal(connectorSnapshot(input).inventoryComplete, false);
});
test('only fixed admission fields survive untrusted logs', () => {
  const rows = admissionEvidence('123', '2026-11-12T10:00:00Z R1_ADMISSION {"action":"skip","reason":"backoff","remainingMs":123,"secret":"private"}\n2026-11-12T10:00:01Z R1_ADMISSION {"action":"blocked","reason":"untrusted provider text"}');
  assert.equal(rows[0].reason, 'backoff');
  assert.equal(rows[1].reason, 'UNKNOWN');
  assert.ok(!JSON.stringify(rows).includes('private'));
});
