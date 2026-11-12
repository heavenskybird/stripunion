import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCadence } from '../cadence-watchdog.mjs';
import { notificationDecision } from '../cadence-observer.mjs';
const now = Date.parse('2026-11-12T10:30:00Z');
const evidence = () => ({ repository: 'heavenskybird/stripunion', defaultBranch: 'main', clockSource: 'chatgpt-automation',
  observedAt: new Date(now).toISOString(), inventoryComplete: true, workflowState: 'active', activeRuns: [],
  receiptSha: 'a'.repeat(40), receipt: { version: 1, runId: '10', cycleId: '10', attempts: 1, status: 'success', recentRunIds: ['10'], startedAt: '2026-11-12T08:00:00Z' }, schedulerRuns: [] });
test('actual admission skip and unavailable workflow capability remain distinct', () => {
  const f = evidence(); f.schedulerRuns = [{ id: '11', event: 'workflow_run', createdAt: '2026-11-12T10:00:00Z' }];
  f.admissions = [{ runId: '11', action: 'skip', reason: 'backoff' }];
  const d = assessCadence(f, { now });
  assert.equal(d.classification, 'ADMISSION_SKIPPED'); assert.equal(d.alert, false);
  f.workflowState = 'UNKNOWN';
  assert.equal(assessCadence(f, { now }).classification, 'EVIDENCE_UNKNOWN');
  f.receipt.startedAt = '2026-11-12T10:00:00Z';
  assert.equal(assessCadence(f, { now }).classification, 'ADMISSION_BACKOFF');
});
test('stable unknown evidence or same incident sends once, recovery sends once, normal cooldown is silent', () => {
  const a = { classification: 'EVIDENCE_UNKNOWN', alert: true, cycleId: '1', runId: '1', checkedAt: new Date(now).toISOString() };
  const first = notificationDecision(a);
  assert.equal(first.notify, true);
  const repeated = notificationDecision({ ...a, cycleId: '2', runId: '2' }, first);
  assert.equal(repeated.notify, false);
  const stillUnknown = notificationDecision({ ...a, classification: 'ADMISSION_BACKOFF', alert: false, evidenceGaps: ['WORKFLOW_STATE_UNAVAILABLE'] }, repeated);
  assert.equal(stillUnknown.notify, false); assert.equal(stillUnknown.alert, true);
  const recovered = notificationDecision({ ...a, classification: 'ADMISSION_BACKOFF', alert: false }, repeated);
  assert.equal(recovered.notificationType, 'RECOVERY');
  assert.equal(notificationDecision({ ...a, classification: 'ADMISSION_BACKOFF', alert: false }, recovered).notify, false);
  const missing = { ...a, classification: 'SCHEDULE_MISSING' };
  const incident = notificationDecision(missing, recovered);
  assert.equal(notificationDecision(missing, incident).notify, false);
});
