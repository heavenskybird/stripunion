import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MINUTE = 60_000;
const STALE_METADATA = new Set(['37655513979', '37655528917']);
const LEGACY_SHA = '710276134f67023864e4e83992cf46080a1c43d8';
const PRODUCERS = new Set(['Editorial producer scheduler', 'Editorial hourly producer']);
const EXTERNAL_CLOCKS = new Set(['chatgpt-automation', 'external-local-clock']);
export function historicalMetadata(run) {
  return STALE_METADATA.has(String(run.id)) && run.headSha === LEGACY_SHA && run.jobCount === 0;
}

// No network, dispatch, receipt writes or stateful retries. Decisions retain unknowns.
export function assessCadence(evidence, { now = Date.now(), graceMinutes = 15 } = {}) {
  const result = { version: 1, checkedAt: Number.isFinite(now) ? new Date(now).toISOString() : null,
    classification: 'EVIDENCE_UNKNOWN', alert: true, readOnly: true, failoverEnabled: false,
    receiptSha: evidence?.receiptSha || null, runId: evidence?.receipt?.runId || null,
    cycleId: evidence?.receipt?.cycleId || null, dueAt: null, overdueMinutes: null };
  const finish = (classification, alert = true) => ({ ...result, classification, alert });
  if (!Number.isFinite(now) || !Number.isFinite(graceMinutes) || graceMinutes < 0 || graceMinutes > 60 ||
      !EXTERNAL_CLOCKS.has(evidence?.clockSource) || evidence?.repository !== 'heavenskybird/stripunion' ||
      evidence?.defaultBranch !== 'main') return finish('EVIDENCE_UNKNOWN');
  const observed = Date.parse(evidence.observedAt);
  if (!Number.isFinite(observed) || observed > now || now - observed > 5 * MINUTE) return finish('EVIDENCE_STALE');
  if (evidence.workflowState === 'disabled_manually') {
    return finish('PAUSED_BY_OPERATOR');
  }
  if (evidence.workflowState === 'disabled_inactivity') return finish('WORKFLOW_INACTIVE');
  if (evidence.workflowState !== 'active' || !evidence.inventoryComplete || !Array.isArray(evidence.activeRuns)) return finish('EVIDENCE_UNKNOWN');
  const state = evidence.receipt;
  if (!/^[a-f0-9]{40}$/.test(evidence.receiptSha || '') || !state || state.version !== 1 ||
      !['success', 'failure', 'running'].includes(state.status) || !Number.isInteger(state.attempts) || state.attempts < 1 ||
      !/^\d+$/.test(state.runId || '') || !/^\d+$/.test(state.cycleId || '') ||
      !Array.isArray(state.recentRunIds) || state.recentRunIds.length > 200 || !state.recentRunIds.every(id => /^\d+$/.test(id))) return finish('EVIDENCE_UNKNOWN');
  const started = Date.parse(state.startedAt);
  if (!Number.isFinite(started) || started > now) return finish('EVIDENCE_UNKNOWN');
  const due = started + (state.status === 'success' ? 52 : 10) * MINUTE;
  result.dueAt = new Date(due).toISOString();
  result.overdueMinutes = Math.max(0, (now - due) / MINUTE);
  result.ignoredHistoricalRunIds = evidence.activeRuns.filter(historicalMetadata).map(r => String(r.id));
  const actual = evidence.activeRuns.filter(r => !historicalMetadata(r));
  if (actual.some(r => PRODUCERS.has(r.name))) return finish('WRITER_ACTIVE', false);
  if (state.status === 'failure') return finish('PRODUCER_FAILURE');
  if (now < due) return finish('ADMISSION_BACKOFF', false);
  if (state.status === 'running') return finish('PRODUCER_INCOMPLETE');
  if (result.overdueMinutes <= graceMinutes) return finish('DUE_WITHIN_GRACE', false);
  const schedules = (evidence.schedulerRuns || []).filter(r => r.event === 'schedule' && Date.parse(r.createdAt) >= due && Date.parse(r.createdAt) <= now);
  const wakeups = (evidence.schedulerRuns || []).filter(r => Date.parse(r.createdAt) >= due && Date.parse(r.createdAt) <= now);
  result.postDueScheduleRunIds = schedules.map(r => String(r.id));
  result.postDueWakeRunIds = wakeups.map(r => String(r.id));
  if (!wakeups.length) return finish('SCHEDULE_MISSING');
  // A wake is evidence of delivery only, never of a five-guide publication.
  return finish('WAKE_SUPPRESSED_OR_UNADMITTED');
}

// A proposal, not an executable failover. Durable CAS reservation and a second fresh
// inventory would be required in a future reviewed sender. This module cannot send.
export function planCompensation(evidence, assessment, reservation = {}) {
  const denied = reason => ({ execute: false, eligibleForFutureReview: false, reason, maxWakeups: 1 });
  if (!['SCHEDULE_MISSING', 'WAKE_SUPPRESSED_OR_UNADMITTED'].includes(assessment.classification)) return denied('NOT_AN_ELIGIBLE_MISSED_WAKE');
  if (evidence.receipt?.status !== 'success' || assessment.receiptSha !== evidence.receiptSha || reservation.expectedReceiptSha !== evidence.receiptSha) return denied('RECEIPT_GUARD_MISMATCH');
  if (evidence.activeRuns.some(r => !historicalMetadata(r))) return denied('QUEUE_NOT_DRAINED');
  if (reservation.alreadyRequested || !reservation.durableCasReservationVerified) return denied('NO_UNIQUE_DURABLE_RESERVATION');
  return { execute: false, eligibleForFutureReview: true, reason: 'AUTOMATIC_FAILOVER_NOT_ENABLED', maxWakeups: 1,
    idempotencyKey: createHash('sha256').update(`heavenskybird/stripunion:${evidence.receiptSha}:${evidence.receipt.cycleId}`).digest('hex'),
    proposedEvent: 'workflow_dispatch', proposedWorkflow: 'editorial-producer-scheduler.yml', proposedRef: 'main',
    requiredFinalChecks: ['receipt SHA unchanged', 'fresh inventory and scheduler active', 'atomic reservation retained on unknown dispatch outcome', 'normal R1 admission still authoritative'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/cadence-watchdog.mjs EVIDENCE.json [NOW_ISO]');
  const evidence = JSON.parse(await fs.readFile(file, 'utf8'));
  const assessment = assessCadence(evidence, { now: process.argv[3] ? Date.parse(process.argv[3]) : Date.now() });
  console.log('CADENCE_WATCHDOG ' + JSON.stringify(assessment));
  process.exitCode = assessment.alert ? 2 : 0;
}
