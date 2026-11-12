import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assessCadence } from './cadence-watchdog.mjs';

export function notificationDecision(assessment, previous = null) {
  if (!assessment.alert && previous?.classification === 'EVIDENCE_UNKNOWN' && assessment.evidenceGaps?.length) {
    return { ...previous, notify: false, notificationType: 'SUPPRESSED', checkedAt: assessment.checkedAt };
  }
  // Unknown evidence is keyed by the missing capability, not each new receipt,
  // so successful new batches cannot generate a stream of identical alerts.
  const identity = assessment.classification.startsWith('EVIDENCE_')
    ? [assessment.classification] : [assessment.classification, assessment.cycleId, assessment.runId];
  const incidentKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const notify = assessment.alert && (!previous?.alert || previous.incidentKey !== incidentKey);
  const recovered = !assessment.alert && previous?.alert === true;
  return { notify: notify || recovered, notificationType: notify ? 'INCIDENT' : recovered ? 'RECOVERY' : 'SUPPRESSED',
    incidentKey, alert: assessment.alert, classification: assessment.classification,
    checkedAt: assessment.checkedAt, lastNotifiedAt: notify || recovered ? assessment.checkedAt : previous?.lastNotifiedAt || null };
}

// The only mutation is this external observer's local notification cache. No
// repository, GitHub API, production receipt, scheduler, or provider writes.
export async function observeOnce(evidence, statePath, { now = Date.now() } = {}) {
  const resolved = path.resolve(statePath);
  if (!resolved.startsWith('/workspace/scratch/stripunion-cadence/')) throw new Error('LOCAL_OBSERVER_CACHE_PATH_REQUIRED');
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  const lockPath = resolved + '.lock';
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') return { notify: false, classification: 'OBSERVATION_ALREADY_ACTIVE' }; throw error; }
  try {
    let previous = null;
    try { previous = JSON.parse(await fs.readFile(resolved, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('OBSERVER_NOTIFICATION_CACHE_UNREADABLE'); }
    const assessment = assessCadence(evidence, { now });
    const notification = notificationDecision(assessment, previous);
    const temp = resolved + `.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(notification, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(temp, resolved);
    return { ...notification, assessment, productionWrites: 0, providerRequests: 0 };
  } finally { await lock.close(); await fs.unlink(lockPath); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [evidencePath, statePath] = process.argv.slice(2);
  if (!evidencePath || !statePath) throw new Error('Usage: cadence-observer.mjs EVIDENCE.json LOCAL_CACHE.json');
  const result = await observeOnce(JSON.parse(await fs.readFile(evidencePath, 'utf8')), statePath);
  console.log('CADENCE_OBSERVER ' + JSON.stringify(result));
}
