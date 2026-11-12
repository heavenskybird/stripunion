import test from 'node:test';
import assert from 'node:assert/strict';
import { archivedBufferEvidence, classifyUnknown, cutoverReadiness, auditDirectory } from '../social-outbox-cutover-audit.mjs';
import { normalizeTelegramChatId } from '../../ops/seo-data-layer/src/distribution/telegram.mjs';

const event = { state: 'reconcile_required', idempotency_key: 'astro:example:x', channel: 'x', provider: 'buffer',
  slug: 'example', url: 'https://stripunion.com/guides/example', desired_at: '2026-10-07T04:00:00Z' };
const post = { id: 'post-1', channelId: 'expected', status: 'sent', dueAt: '2026-10-08T04:00:00Z',
  text: 'Read https://stripunion.com/guides/example/?utm_source=x' };
const snapshot = posts => ({ channel: { id: 'expected' }, collectedAt: '2026-11-04T07:34:18Z', sentPosts: posts });

test('Telegram numeric IDs remain numeric strings and public usernames receive one prefix', () => {
  assert.equal(normalizeTelegramChatId('-1001234567890'), '-1001234567890');
  assert.equal(normalizeTelegramChatId(' 123456 '), '123456');
  assert.equal(normalizeTelegramChatId('stripunion'), '@stripunion');
  assert.equal(normalizeTelegramChatId('@stripunion'), '@stripunion');
  assert.equal(normalizeTelegramChatId(undefined), '');
});

test('archive candidates require exact publication, channel, date and optional stored identity; never permit replay', () => {
  const evidence = archivedBufferEvidence([snapshot([post]), snapshot([post])], 'expected');
  assert.equal(evidence.length, 1);
  const candidate = classifyUnknown(event, evidence);
  assert.equal(candidate.classification, 'PROVIDER_CANDIDATE_REQUIRES_REVIEW');
  assert.equal(candidate.retryEligible, false);
  assert.equal(candidate.proofLevel, 'PUBLICATION_AND_TIME_ONLY');
  for (const row of [{ ...post, channelId: 'other' }, { ...post, text: 'https://example.invalid/guides/example' },
    { ...post, dueAt: '2026-09-01T00:00:00Z' }, { ...post, text: 'https://stripunion.com/guides/example-other' }]) {
    assert.notEqual(classifyUnknown(event, archivedBufferEvidence([snapshot([row])], 'expected')).classification, 'PROVIDER_CANDIDATE_REQUIRES_REVIEW');
  }
  assert.equal(classifyUnknown({ ...event, provider_message_id: 'different' }, evidence).classification, 'STORED_RECEIPT_NOT_CORROBORATED');
  assert.equal(classifyUnknown(event, [...evidence, { ...evidence[0], id: 'post-2' }]).classification, 'AMBIGUOUS_PROVIDER_CANDIDATES');
});

test('missing Telegram archive and no-match Buffer snapshots preserve uncertainty rather than proving not sent', () => {
  for (const row of [event, { ...event, channel: 'telegram', provider: 'telegram' }]) {
    const result = classifyUnknown(row, []);
    assert.equal(result.classification, 'NO_PROVIDER_ARCHIVE');
    assert.equal(result.archiveAbsenceProvesNotSent, false);
    assert.equal(result.action, 'QUARANTINE_NO_REPLAY');
  }
});

const accepted = { sendEnabled: true, singleWriterAccepted: true, runtimeProvisioned: true,
  durableBudgetAccepted: true,
  legacyEntrypointsDisabled: true, unknownInventoryReviewed: true, telegramEnabled: true,
  telegramCredentialAccepted: true, telegramProviderFailure: false, xEnabled: true,
  bufferCooldownActive: false, bufferBudgetAccepted: true, bufferEvidenceFresh: true };
test('dry-run channel readiness isolates Buffer cooldown from Telegram and preserves provider errors', () => {
  const result = cutoverReadiness({ ...accepted, bufferCooldownActive: true });
  assert.equal(result.telegram.ready, true);
  assert.equal(result.x.ready, false);
  assert.equal(result.externalRequests, 0);
  assert.equal(result.stateChanges, 0);
  assert.equal(cutoverReadiness({ ...accepted, telegramProviderFailure: true }).telegram.ready, false);
  assert.equal(cutoverReadiness({ ...accepted, telegramProviderFailure: true }).x.ready, true);
});
test('operator pause and unaccepted writer/runtime fail closed for both channels, independently of credentials', () => {
  for (const change of [{ sendEnabled: false }, { singleWriterAccepted: false }, { runtimeProvisioned: false }, { durableBudgetAccepted: false },
    { unknownInventoryReviewed: false }, { legacyEntrypointsDisabled: false }]) {
    const result = cutoverReadiness({ ...accepted, ...change });
    assert.equal(result.telegram.ready, false);
    assert.equal(result.x.ready, false);
  }
  assert.equal(cutoverReadiness({ ...accepted, bufferCooldownActive: undefined }).x.ready, false);
});
test('tracked historical inventory stays quarantined and CLI audit cannot access the network', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Network forbidden in offline audit'); };
  try {
    const report = await auditDirectory(new URL('../../', import.meta.url).pathname);
    assert.equal(report.unknownCount, 73);
    assert.deepEqual(report.byChannel, { telegram: 45, x: 28 });
    assert.equal(report.rows.every(r => r.retryEligible === false && r.action === 'QUARANTINE_NO_REPLAY'), true);
    assert.equal(report.stateChanges, 0);
  } finally { globalThis.fetch = previous; }
});
