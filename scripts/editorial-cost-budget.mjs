// Offline accounting and pre-spend policy only. No provider/client or production
// generator imports this module until a separately reviewed rollout.
const integer = n => Number.isSafeInteger(n) && n >= 0;
export function verifiedPrice(config, model, now = Date.now()) {
  const p = config?.models?.[model];
  return config?.version === 1 && p?.verified === true &&
    /^https:\/\/(?:developers\.openai\.com|platform\.openai\.com|openai\.com)\//.test(p.sourceUrl || '') &&
    Number.isFinite(Date.parse(p.verifiedAt)) && Date.parse(p.verifiedAt) <= now &&
    Number.isFinite(Date.parse(p.expiresAt)) && Date.parse(p.expiresAt) > now &&
    [p.inputUsdPerMillion, p.outputUsdPerMillion].every(n => Number.isFinite(n) && n >= 0) ? p : null;
}
export function accountRequests(requests, { config, model, now } = {}) {
  const seen = new Set();
  const rows = [];
  for (const request of requests) {
    // Completed attempt identity is mandatory: duplicates must not double charge
    // a report, and absent evidence cannot be silently counted as free usage.
    if (!request.runId || !Number.isInteger(request.attempt) || request.attempt < 1) throw new Error('USAGE_IDENTITY_REQUIRED');
    const key = `${request.runId}:${request.attempt}`;
    if (seen.has(key)) throw new Error('DUPLICATE_USAGE_IDENTITY');
    seen.add(key);
    rows.push(request);
  }
  const complete = rows.every(r => integer(r.inputTokens) && integer(r.outputTokens));
  const inputTokens = complete ? rows.reduce((n, r) => n + r.inputTokens, 0) : null;
  const outputTokens = complete ? rows.reduce((n, r) => n + r.outputTokens, 0) : null;
  const price = verifiedPrice(config, model, now);
  const estimatedUsd = complete && price ? (inputTokens * price.inputUsdPerMillion + outputTokens * price.outputUsdPerMillion) / 1e6 : null;
  return { requests: rows.length, runs: new Set(rows.map(r => r.runId)).size,
    retries: rows.filter(r => r.attempt > 1).length, inputTokens, outputTokens,
    totalTokens: complete ? inputTokens + outputTokens : null,
    usageStatus: complete ? 'RECORDED' : 'UNKNOWN', estimatedUsd,
    costStatus: estimatedUsd === null ? 'UNKNOWN' : 'ESTIMATE_NOT_INVOICE',
    priceSource: price?.sourceUrl || null, priceVerifiedAt: price?.verifiedAt || null,
    remainingCredit: 'UNKNOWN', actualInvoiceUsd: null };
}
export function assessBudget({ config, model, now, limits, spent, reservation }) {
  const deny = reason => ({ allowed: false, reason, providerCallsAllowed: 0 });
  if (!limits || !spent || !reservation || ![limits.batchRequests, limits.batchOutputTokens, limits.dailyRequests, limits.dailyTokens,
    spent.batchRequests, spent.batchOutputTokens, spent.dailyRequests, spent.dailyTokens,
    reservation.requests, reservation.inputTokens, reservation.outputTokens].every(integer)) return deny('BUDGET_EVIDENCE_UNKNOWN');
  if (reservation.requests < 1) return deny('INVALID_RESERVATION');
  if (spent.batchRequests + reservation.requests > limits.batchRequests || spent.batchOutputTokens + reservation.outputTokens > limits.batchOutputTokens) return deny('BATCH_TOKEN_OR_REQUEST_LIMIT');
  if (spent.dailyRequests + reservation.requests > limits.dailyRequests || spent.dailyTokens + reservation.inputTokens + reservation.outputTokens > limits.dailyTokens) return deny('DAILY_TOKEN_OR_REQUEST_LIMIT');
  const price = verifiedPrice(config, model, now);
  if (!price) return deny('VERIFIED_PRICE_UNKNOWN');
  if (![limits.batchUsd, limits.dailyUsd, spent.batchUsd, spent.dailyUsd, spent.availableCreditUsd].every(n => Number.isFinite(n) && n >= 0)) return deny('DOLLAR_OR_CREDIT_EVIDENCE_UNKNOWN');
  const reserveUsd = (reservation.inputTokens * price.inputUsdPerMillion + reservation.outputTokens * price.outputUsdPerMillion) / 1e6;
  if (spent.batchUsd + reserveUsd > limits.batchUsd || spent.dailyUsd + reserveUsd > limits.dailyUsd || reserveUsd > spent.availableCreditUsd) return deny('DOLLAR_OR_CREDIT_LIMIT');
  return { allowed: true, reason: 'BOUNDED_RESERVATION_REQUIRED', providerCallsAllowed: reservation.requests,
    reserveUsd, note: 'Caller must CAS-reserve across all writers before any request; this pure result is not a lease.' };
}
