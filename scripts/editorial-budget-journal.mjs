import { createHash } from 'node:crypto';
import { assessBudget, verifiedPrice } from './editorial-cost-budget.mjs';
import { documentDigest } from './editorial-novelty-receipt.mjs';

const integer = n => Number.isSafeInteger(n) && n >= 0;
const money = n => Number.isFinite(n) && n >= 0;
const statuses = new Set(['reserved', 'completed', 'unknown']);
const sha = value => /^[a-f0-9]{40}$/.test(value || '');
export function validateJournal(state) {
  if (state?.version !== 1 || state.currency !== 'USD' || !Array.isArray(state.entries) || state.entries.length > 10_000 ||
      !state.creditProof || state.creditProof.verified !== true || !money(state.creditProof.availableUsd) ||
      !/^[a-f0-9]{64}$/.test(state.creditProof.providerScopeDigest || '') ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(state.creditProof.id || '') ||
      !['OPERATOR_VERIFIED_BILLING', 'VERIFIED_OFFICIAL_BILLING_EXPORT'].includes(state.creditProof.source)) throw new Error('BUDGET_JOURNAL_UNPROVISIONED_OR_CORRUPT');
  const keys = new Set();
  for (const entry of state.entries) {
    if (!entry || keys.has(entry.requestKey) || !/^[a-f0-9]{64}$/.test(entry.requestKey || '') ||
        !/^[a-zA-Z0-9_-]{1,120}$/.test(entry.batchId || '') || !statuses.has(entry.status) ||
        !Number.isFinite(Date.parse(entry.reservedAt)) || new Date(entry.reservedAt).toISOString() !== entry.reservedAt || ![entry.inputTokens, entry.outputTokens].every(integer) ||
        !money(entry.reserveUsd) || !/^[a-f0-9]{64}$/.test(entry.inputDigest || '') ||
        !Number.isInteger(entry.attempt) || entry.attempt < 1 || !/^[a-f0-9]{64}$/.test(entry.priceDigest || '')) throw new Error('BUDGET_JOURNAL_CORRUPT_ENTRY');
    keys.add(entry.requestKey);
  }
  return state;
}

// No automatic provisioning or missing-file fallback. An operator-reviewed
// isolated branch/file must exist before this adapter can reserve any spend.
export function githubContentsBudgetStore({ api, repository = 'heavenskybird/stripunion',
  branch = 'codex/editorial-budget-runtime', file = 'ops/control-plane/editorial-budget-journal.json' }) {
  if (typeof api !== 'function' || repository !== 'heavenskybird/stripunion' ||
      branch !== 'codex/editorial-budget-runtime' || file !== 'ops/control-plane/editorial-budget-journal.json') throw new Error('BUDGET_STORE_SCOPE_REFUSED');
  const base = `/repos/${repository}/contents/${file}`;
  return {
    async read() {
      let result;
      try { result = await api(`${base}?ref=${encodeURIComponent(branch)}`, 'GET'); }
      catch { throw new Error('BUDGET_STORE_READ_REFUSED'); }
      if (!sha(result?.sha) || result.encoding !== 'base64' || typeof result.content !== 'string') throw new Error('BUDGET_STORE_INVALID_FILE');
      let state;
      try { state = validateJournal(JSON.parse(Buffer.from(result.content, 'base64').toString('utf8'))); }
      catch { throw new Error('BUDGET_JOURNAL_UNPROVISIONED_OR_CORRUPT'); }
      return { sha: result.sha, state };
    },
    async compareAndSwap(expectedSha, state) {
      if (!sha(expectedSha)) throw new Error('BUDGET_CAS_SHA_REQUIRED');
      validateJournal(state);
      let result;
      try { result = await api(base, 'PUT', { branch, sha: expectedSha,
        message: 'ops: preserve editorial budget reservation evidence [skip ci]',
        content: Buffer.from(JSON.stringify(state, null, 2) + '\n').toString('base64') }); }
      catch { throw new Error('BUDGET_CAS_REFUSED'); }
      if (!sha(result?.content?.sha)) throw new Error('BUDGET_CAS_CONFIRMATION_UNKNOWN');
      return result.content.sha;
    }
  };
}

export async function reserveEditorialRequest({ store, batchId, attempt, input, model, tokenEvidence,
  maxOutputTokens, config, limits, providerScopeDigest, now = Date.now() }) {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(batchId || '') || !Number.isInteger(attempt) || attempt < 1 ||
      typeof input !== 'string' || !integer(maxOutputTokens) || maxOutputTokens < 1 ||
      !/^[a-zA-Z0-9_.:-]{1,100}$/.test(model || '')) throw new Error('BUDGET_REQUEST_INVALID');
  const inputDigest = createHash('sha256').update(input).digest('hex');
  if (tokenEvidence?.verified !== true || tokenEvidence.model !== model || tokenEvidence.inputDigest !== inputDigest ||
      !integer(tokenEvidence.upperBoundTokens) || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(tokenEvidence.tokenizerVersion || '')) throw new Error('BUDGET_INPUT_BOUND_UNVERIFIED');
  const requestKey = documentDigest({ batchId, attempt });
  const snapshot = await store.read();
  const state = validateJournal(snapshot.state);
  if (!/^[a-f0-9]{64}$/.test(providerScopeDigest || '') || providerScopeDigest !== state.creditProof.providerScopeDigest) throw new Error('BUDGET_PROVIDER_SCOPE_UNVERIFIED');
  if (state.entries.some(e => Date.parse(e.reservedAt) > now)) throw new Error('BUDGET_FUTURE_RESERVATION');
  if (state.entries.some(e => e.outcome === 'TOKEN_BOUND_EXCEEDED')) throw new Error('BUDGET_TOKEN_BOUND_BREACH');
  if (state.entries.length >= 10_000) throw new Error('BUDGET_JOURNAL_FULL');
  if (state.entries.some(e => e.requestKey === requestKey)) throw new Error('BUDGET_REQUEST_ALREADY_JOURNALED');
  if (state.entries.some(e => e.batchId === batchId && e.status !== 'completed')) throw new Error('BUDGET_BATCH_HAS_UNCERTAIN_REQUEST');
  const dayUtc = new Date(now).toISOString().slice(0, 10);
  const daily = state.entries.filter(e => e.reservedAt.slice(0, 10) === dayUtc);
  const batch = state.entries.filter(e => e.batchId === batchId);
  const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
  // Hold every reservation, including unknowns across midnight. Never release
  // quota/credit merely because an API result, completion CAS, or day changed.
  const spent = { dayUtc, batchRequests: batch.length, batchOutputTokens: sum(batch, 'outputTokens'),
    dailyRequests: daily.length, dailyTokens: sum(daily, 'inputTokens') + sum(daily, 'outputTokens'),
    batchUsd: sum(batch, 'reserveUsd'), dailyUsd: sum(daily, 'reserveUsd'),
    availableCreditUsd: Math.max(0, state.creditProof.availableUsd - sum(state.entries, 'reserveUsd')),
    creditVerifiedAt: state.creditProof.observedAt };
  const decision = assessBudget({ config, model, limits, spent, now,
    reservation: { requests: 1, inputTokens: tokenEvidence.upperBoundTokens, outputTokens: maxOutputTokens } });
  if (!decision.allowed) throw new Error(decision.reason);
  const reserveUsd = Math.ceil(decision.reserveUsd * 1_000_000) / 1_000_000;
  if (spent.batchUsd + reserveUsd > limits.batchUsd || spent.dailyUsd + reserveUsd > limits.dailyUsd || reserveUsd > spent.availableCreditUsd) throw new Error('DOLLAR_OR_CREDIT_LIMIT');
  const price = verifiedPrice(config, model, now);
  const entry = { requestKey, batchId, attempt, model, inputDigest,
    inputTokens: tokenEvidence.upperBoundTokens, outputTokens: maxOutputTokens,
    reserveUsd, priceDigest: documentDigest(price),
    reservedAt: new Date(now).toISOString(), status: 'reserved' };
  const next = { ...state, entries: [...state.entries, entry] };
  const reservationSha = await store.compareAndSwap(snapshot.sha, next);
  // Verify the durable identity after CAS. Any lost/ambiguous confirmation stops
  // before the provider rather than guessing whether ownership was acquired.
  const confirmed = await store.read();
  const persisted = confirmed.state.entries.find(e => e.requestKey === requestKey);
  if (!persisted || documentDigest(persisted) !== documentDigest(entry)) throw new Error('BUDGET_RESERVATION_CONFIRMATION_UNKNOWN');
  return { entry, reservationSha };
}

export async function completeEditorialRequest({ store, reservation, usage, outcome, now = Date.now() }) {
  const snapshot = await store.read();
  const state = validateJournal(snapshot.state);
  const index = state.entries.findIndex(e => e.requestKey === reservation.entry.requestKey);
  if (index < 0 || documentDigest(state.entries[index]) !== documentDigest(reservation.entry)) throw new Error('BUDGET_COMPLETION_IDENTITY_CHANGED');
  const known = outcome === 'completed' && integer(usage?.inputTokens) && integer(usage?.outputTokens);
  const overrun = known && (usage.inputTokens > reservation.entry.inputTokens || usage.outputTokens > reservation.entry.outputTokens);
  const completed = { ...state.entries[index], status: known && !overrun ? 'completed' : 'unknown',
    finishedAt: new Date(now).toISOString(), outcome: overrun ? 'TOKEN_BOUND_EXCEEDED' : known ? 'RECORDED_USAGE' : 'PROVIDER_RESULT_OR_USAGE_UNKNOWN',
    actualInputTokens: known ? usage.inputTokens : null, actualOutputTokens: known ? usage.outputTokens : null };
  const entries = [...state.entries]; entries[index] = completed;
  // One bounded completion CAS; a loss leaves the original reservation held.
  const completionSha = await store.compareAndSwap(snapshot.sha, { ...state, entries });
  return { entry: completed, completionSha, withinBound: known && !overrun };
}
