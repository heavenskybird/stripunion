import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCadence, planCompensation } from '../cadence-watchdog.mjs';

const now = Date.parse('2026-11-12T05:48:00Z');
const fixture = () => ({ clockSource: 'chatgpt-automation', repository: 'heavenskybird/stripunion', defaultBranch: 'main',
  observedAt: new Date(now).toISOString(), workflowState: 'active', inventoryComplete: true, activeRuns: [], schedulerRuns: [],
  receiptSha: 'e64ad94bc6d5eaa4d74fcae8294fac1f951acd43', receipt: { version: 1, status: 'success', attempts: 2,
    cycleId: '41254032304', runId: '43151510253', startedAt: '2026-11-12T03:56:44.969Z',
    finishedAt: '2026-11-12T04:05:23.935Z', recentRunIds: ['43151510253'] } });
test('independent clock detects missing schedule from startedAt, not finishedAt', () => {
  const d = assessCadence(fixture(), { now });
  assert.equal(d.classification, 'SCHEDULE_MISSING');
  assert.equal(d.dueAt, '2026-11-12T04:48:44.969Z');
  assert.equal(d.alert, true);
  assert.equal(d.failoverEnabled, false);
});
test('backoff, grace and active/queued writers prevent compensating wake', () => {
  let f = fixture(); f.receipt.startedAt = '2026-11-12T05:30:00Z';
  assert.equal(assessCadence(f, { now }).classification, 'ADMISSION_BACKOFF');
  f.receipt.startedAt = '2026-11-12T04:48:00Z';
  assert.equal(assessCadence(f, { now }).classification, 'DUE_WITHIN_GRACE');
  f.activeRuns = [{ id: '1', name: 'Editorial producer scheduler', status: 'queued', jobCount: 0 }];
  assert.equal(assessCadence(f, { now }).classification, 'WRITER_ACTIVE');
});
test('only exact inspected historical zero-job metadata is ignored', () => {
  const f = fixture(); f.activeRuns = [{ id: '37655513979', name: 'Control plane authority promotion', status: 'queued', jobCount: 0, headSha: '710276134f67023864e4e83992cf46080a1c43d8' }];
  const d = assessCadence(f, { now });
  assert.equal(d.classification, 'SCHEDULE_MISSING');
  assert.deepEqual(d.ignoredHistoricalRunIds, ['37655513979']);
  const p = planCompensation(f, d, { expectedReceiptSha: f.receiptSha, durableCasReservationVerified: true });
  assert.equal(p.execute, false); assert.equal(p.eligibleForFutureReview, true);
  f.activeRuns[0].status = 'in_progress';
  assert.equal(planCompensation(f, d, { expectedReceiptSha: f.receiptSha, durableCasReservationVerified: true }).reason, 'QUEUE_NOT_DRAINED');
  f.activeRuns[0].status = 'queued';
  f.activeRuns[0].jobCount = 1;
  assert.equal(planCompensation(f, d, { expectedReceiptSha: f.receiptSha, durableCasReservationVerified: true }).reason, 'QUEUE_NOT_DRAINED');
});
test('disabled, failed, incomplete and unknown inventories are not schedule recovery permission', () => {
  for (const [state, expected] of [['disabled_manually', 'PAUSED_BY_OPERATOR'], ['disabled_inactivity', 'WORKFLOW_INACTIVE']]) {
    const f = fixture(); f.workflowState = state;
    assert.equal(assessCadence(f, { now }).classification, expected);
  }
  for (const [status, expected] of [['failure', 'PRODUCER_FAILURE'], ['running', 'PRODUCER_INCOMPLETE']]) {
    const f = fixture(); f.receipt.status = status;
    assert.equal(assessCadence(f, { now }).classification, expected);
  }
  const f = fixture(); f.inventoryComplete = false;
  assert.equal(assessCadence(f, { now }).classification, 'EVIDENCE_UNKNOWN');
  f.inventoryComplete = true; f.clockSource = 'github-cron';
  assert.equal(assessCadence(f, { now }).classification, 'EVIDENCE_UNKNOWN');
});
test('late cron delivery / token-suppressed chain distinguishes a wake from business output', () => {
  const f = fixture(); f.schedulerRuns = [{ id: '2', event: 'schedule', createdAt: '2026-11-12T05:30:00Z', conclusion: 'success' }];
  assert.equal(assessCadence(f, { now }).classification, 'WAKE_SUPPRESSED_OR_UNADMITTED');
  f.schedulerRuns = [{ id: '3', event: 'workflow_run', createdAt: '2026-11-12T04:20:12Z', conclusion: 'success' }];
  assert.equal(assessCadence(f, { now }).classification, 'SCHEDULE_MISSING');
});
test('stale/future evidence, receipt races and duplicate reservations fail closed', () => {
  let f = fixture(); f.observedAt = '2026-11-12T05:40:00Z';
  assert.equal(assessCadence(f, { now }).classification, 'EVIDENCE_STALE');
  f = fixture(); f.receipt.startedAt = '2026-11-13T00:00:00Z';
  assert.equal(assessCadence(f, { now }).classification, 'EVIDENCE_UNKNOWN');
  f = fixture(); const d = assessCadence(f, { now });
  assert.equal(planCompensation(f, d, { expectedReceiptSha: '0'.repeat(40), durableCasReservationVerified: true }).reason, 'RECEIPT_GUARD_MISMATCH');
  assert.equal(planCompensation(f, d, { expectedReceiptSha: f.receiptSha, alreadyRequested: true, durableCasReservationVerified: true }).reason, 'NO_UNIQUE_DURABLE_RESERVATION');
});
