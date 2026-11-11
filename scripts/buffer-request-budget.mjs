import { journal, validateCap } from './social-outbox-safety.mjs';

const identity = 'provider:buffer:request-budget:v1';
const dayMs = 86_400_000;
export async function reserveBufferRequest(store, now = Date.now(), { daily = 12, monthly = 30 } = {}) {
  daily = validateCap(daily, 12);
  monthly = validateCap(monthly, 100);
  const old = store.state;
  if (old && (old.kind !== 'buffer-request-budget' || old.idempotency_key !== identity ||
      !Number.isFinite(old.windowStartedAt) || old.windowStartedAt > now ||
      !Number.isInteger(old.used) || old.used < 0 || !Number.isInteger(old.dailyUsed) || old.dailyUsed < 0 ||
      (old.blockedUntil != null && !Number.isFinite(old.blockedUntil)))) throw new Error('Invalid Buffer budget; requests blocked.');
  if (old?.blockedUntil > now) throw new Error('BUFFER_BUDGET_BLOCKED provider cooldown active');
  const day = new Date(now).toISOString().slice(0, 10);
  const reset = !old || now - old.windowStartedAt >= 30 * dayMs;
  const state = { version: 1, kind: 'buffer-request-budget', idempotency_key: identity,
    windowStartedAt: reset ? now : old.windowStartedAt, used: reset ? 0 : old.used,
    day, dailyUsed: old?.day === day ? old.dailyUsed : 0, blockedUntil: null };
  if (state.used >= monthly || state.dailyUsed >= daily) throw new Error('BUFFER_BUDGET_BLOCKED local request ceiling reached');
  await store.write({ ...state, used: state.used + 1, dailyUsed: state.dailyUsed + 1 });
}

export async function budgetedBufferFetch(url, options, { store, fetchImpl = fetch, now = Date.now } = {}) {
  store ||= await journal({ idempotency_key: identity });
  await reserveBufferRequest(store, now(), {
    daily: Number(process.env.BUFFER_REQUEST_DAILY_BUDGET ?? 12),
    monthly: Number(process.env.BUFFER_REQUEST_30D_BUDGET ?? 30)
  });
  const response = await fetchImpl(url, { ...options, signal: options?.signal || AbortSignal.timeout(15_000) });
  // A quota denial stops all cooperating callers. No retries and no paid upgrade.
  let quotaErrors = [];
  try { const payload = await response.clone().json(); quotaErrors = Array.isArray(payload.errors) ? payload.errors : []; } catch {}
  if (response.status === 429 || quotaErrors.some(e => e.extensions?.code === 'RATE_LIMIT_EXCEEDED')) {
    const monthly = quotaErrors.some(e => e.extensions?.window === '30d');
    const retry = Number(response.headers.get('retry-after'));
    const retryDate = Date.parse(response.headers.get('retry-after') || '');
    const delay = Math.max(monthly ? 30 * dayMs : 3_600_000,
      Number.isFinite(retry) ? retry * 1000 : 0, Number.isFinite(retryDate) ? retryDate - now() : 0);
    await store.write({ ...store.state, blockedUntil: now() + delay });
  }
  return response;
}

export function bufferFetch(url, options) {
  // Dormant until the coordinated single-writer cutover; legacy behavior remains
  // reviewable separately. Every native sender/collector is wired to this gate.
  return process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED === 'true'
    ? budgetedBufferFetch(url, options) : fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(15_000) });
}
