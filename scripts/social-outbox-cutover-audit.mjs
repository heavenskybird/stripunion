// Offline only: no provider client, GitHub API, fetch, or event mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function canonicalPublication(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['stripunion.com', 'blog.stripunion.com'].includes(url.hostname)) return null;
    return url.origin + url.pathname.replace(/\/$/, '');
  } catch { return null; }
}

function publications(text) {
  return new Set((String(text || '').match(/https:\/\/[^\s<>"']+/g) || [])
    .map(value => canonicalPublication(value.replace(/[),.;]+$/, ''))).filter(Boolean));
}

export function archivedBufferEvidence(snapshots, expectedChannelId) {
  const rows = new Map();
  for (const snapshot of snapshots) {
    if (!expectedChannelId || snapshot.channel?.id !== expectedChannelId || !Number.isFinite(Date.parse(snapshot.collectedAt))) continue;
    for (const post of [...(snapshot.sentPosts || []), ...(snapshot.scheduledPosts || [])]) {
      if (!post?.id || post.channelId !== expectedChannelId || !['sent', 'scheduled'].includes(post.status)) continue;
      const timestamp = post.sentAt || post.dueAt;
      if (!Number.isFinite(Date.parse(timestamp))) continue;
      const identity = String(post.id);
      const previous = rows.get(identity);
      // Repeated snapshots of one post are one candidate; sent evidence cannot downgrade.
      if (!previous || (previous.status !== 'sent' && post.status === 'sent')) {
        rows.set(identity, { id: identity, channel: 'x', provider: 'buffer', status: post.status,
          timestamp, publicationUrls: [...publications(post.text)], collectedAt: snapshot.collectedAt });
      }
    }
  }
  return [...rows.values()];
}

export function classifyUnknown(event, evidence) {
  const base = { idempotencyKey: event.idempotency_key, channel: event.channel, slug: event.slug,
    originalState: event.state, action: 'QUARANTINE_NO_REPLAY', retryEligible: false };
  if (event.state !== 'reconcile_required') return { ...base, classification: 'OUTSIDE_UNKNOWN_INVENTORY' };
  const expected = canonicalPublication(event.url);
  if (!expected || !event.idempotency_key || !['x', 'telegram'].includes(event.channel)) {
    return { ...base, classification: 'INVALID_EVENT_EVIDENCE', candidateProviderIds: [] };
  }
  const available = evidence.filter(row => row.channel === event.channel && row.provider === event.provider);
  const candidates = available.filter(row => {
    if (!['sent', 'scheduled'].includes(row.status) || !row.id || !row.publicationUrls?.includes(expected)) return false;
    const delivery = Date.parse(row.timestamp);
    const desired = Date.parse(event.desired_at);
    if (!Number.isFinite(delivery) || !Number.isFinite(desired) || delivery < desired - 300_000) return false;
    return !event.provider_message_id || String(event.provider_message_id) === String(row.id);
  });
  const ids = [...new Set(candidates.map(row => String(row.id)))].sort();
  const classification = ids.length > 1 ? 'AMBIGUOUS_PROVIDER_CANDIDATES'
    : ids.length === 1 ? 'PROVIDER_CANDIDATE_REQUIRES_REVIEW'
    : event.provider_message_id ? 'STORED_RECEIPT_NOT_CORROBORATED'
    : available.length ? 'NO_MATCH_IN_PARTIAL_ARCHIVE' : 'NO_PROVIDER_ARCHIVE';
  return { ...base, classification, candidateProviderIds: ids,
    proofLevel: ids.length === 1 && event.provider_message_id ? 'STORED_ID_AND_PUBLICATION' : ids.length === 1 ? 'PUBLICATION_AND_TIME_ONLY' : 'UNCONFIRMED',
    archiveAbsenceProvesNotSent: false };
}

export function cutoverReadiness(config) {
  // Planning only. A READY result grants no permission and invokes no sender.
  const common = [];
  if (config.sendEnabled !== true) common.push('PAUSED_BY_OPERATOR');
  if (config.singleWriterAccepted !== true) common.push('SINGLE_WRITER_NOT_ACCEPTED');
  if (config.runtimeProvisioned !== true) common.push('RUNTIME_NOT_PROVISIONED');
  if (config.durableBudgetAccepted !== true) common.push('DURABLE_DELIVERY_BUDGET_NOT_ACCEPTED');
  if (config.legacyEntrypointsDisabled !== true) common.push('LEGACY_ENTRYPOINTS_NOT_DRAINED');
  if (config.unknownInventoryReviewed !== true) common.push('UNKNOWN_INVENTORY_NOT_REVIEWED');
  const telegram = [...common];
  const x = [...common];
  if (config.telegramEnabled !== true) telegram.push('CHANNEL_NOT_ENABLED');
  if (config.telegramCredentialAccepted !== true) telegram.push('TELEGRAM_CREDENTIAL_NOT_ACCEPTED');
  if (config.telegramProviderFailure === true) telegram.push('TELEGRAM_PROVIDER_FAILURE');
  if (config.xEnabled !== true) x.push('CHANNEL_NOT_ENABLED');
  if (config.bufferCooldownActive !== false) x.push('BUFFER_COOLDOWN_OR_UNKNOWN');
  if (config.bufferBudgetAccepted !== true) x.push('BUFFER_REQUEST_BUDGET_NOT_ACCEPTED');
  if (config.bufferEvidenceFresh !== true) x.push('BUFFER_EVIDENCE_STALE_OR_UNKNOWN');
  return { dryRun: true, externalRequests: 0, stateChanges: 0,
    telegram: { ready: telegram.length === 0, blockers: telegram },
    x: { ready: x.length === 0, blockers: x } };
}

export async function auditDirectory(root = '.') {
  const eventDir = path.join(root, 'ops/social-outbox/events');
  const names = (await fs.readdir(eventDir)).filter(name => name.endsWith('.json')).sort();
  const unknowns = [];
  const inventoryHash = createHash('sha256');
  for (const name of names) {
    const bytes = await fs.readFile(path.join(eventDir, name));
    inventoryHash.update(name).update('\0').update(bytes).update('\0');
    const event = JSON.parse(bytes);
    if (event.state === 'reconcile_required') unknowns.push(event);
  }
  const rawDir = path.join(root, 'ops/seo-data-layer/data/raw');
  const snapshots = [];
  const archiveFiles = [];
  for (const date of (await fs.readdir(rawDir)).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort()) {
    const file = path.join(rawDir, date, 'buffer.json');
    let bytes;
    try { bytes = await fs.readFile(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    snapshots.push(JSON.parse(bytes));
    archiveFiles.push({ path: `ops/seo-data-layer/data/raw/${date}/buffer.json`, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const latest = [...snapshots].sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt))[0];
  const evidence = archivedBufferEvidence(snapshots, latest?.channel?.id);
  const rows = unknowns.map(event => classifyUnknown(event, evidence));
  const countBy = field => Object.fromEntries([...new Set(rows.map(r => r[field]))].sort().map(key => [key, rows.filter(r => r[field] === key).length]));
  return { version: 1, readOnly: true, externalRequests: 0, stateChanges: 0,
    archiveCoverage: 'PARTIAL_NOT_PROOF_OF_NONDELIVERY', latestArchiveCollectedAt: latest?.collectedAt || null,
    eventInventorySha256: inventoryHash.digest('hex'), archivedUniqueBufferPosts: evidence.length,
    unknownCount: rows.length, byChannel: countBy('channel'), byClassification: countBy('classification'),
    archiveFiles, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // stdout only. Caller chooses a report destination; this program never edits outbox state.
  console.log(JSON.stringify(await auditDirectory(process.argv[2] || '.'), null, 2));
}
