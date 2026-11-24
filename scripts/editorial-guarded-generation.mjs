import { gateCandidate } from './content-novelty-audit.mjs';
import { reserveEditorialRequest, completeEditorialRequest } from './editorial-budget-journal.mjs';
import { verifyNoveltyReview, documentDigest } from './editorial-novelty-receipt.mjs';

// An opt-in worker adapter, deliberately not imported by the current Producer.
// provider, parser, clock and Contents transport are injected; no key/network
// access or publication side effect is hidden in this module.
export async function guardedEditorialGeneration({ enabled = false, provider, parseCandidates,
  expectedCount = 5, ...options } = {}) {
  if (enabled !== true) return { state: 'PAUSED_BY_DEFAULT', providerCalls: 0, publicationAuthorized: false };
  if (typeof provider !== 'function' || typeof parseCandidates !== 'function') throw new Error('GUARDED_WORKER_DEPENDENCIES_REQUIRED');
  const reservation = await reserveEditorialRequest(options);
  let response;
  try {
    response = await provider({ model: options.model, input: options.input,
      max_output_tokens: options.maxOutputTokens, store: false });
  } catch {
    try { await completeEditorialRequest({ store: options.store, reservation, outcome: 'unknown', now: options.now }); }
    catch { throw new Error('GUARDED_PROVIDER_OUTCOME_AND_JOURNAL_UNKNOWN'); }
    throw new Error('GUARDED_PROVIDER_OUTCOME_UNKNOWN');
  }
  let completion;
  try {
    completion = await completeEditorialRequest({ store: options.store, reservation,
      outcome: 'completed', usage: { inputTokens: response?.usage?.input_tokens, outputTokens: response?.usage?.output_tokens }, now: options.now });
  } catch { throw new Error('GUARDED_PROVIDER_COMPLETION_UNCERTAIN'); }
  if (!completion.withinBound) throw new Error('GUARDED_PROVIDER_USAGE_UNKNOWN_OR_BOUND_EXCEEDED');
  if (response?.status !== 'completed') throw new Error('GUARDED_PROVIDER_NOT_COMPLETED_USAGE_RETAINED');
  let candidates;
  try { candidates = await parseCandidates(response); }
  catch { throw new Error('GUARDED_CANDIDATE_PARSE_FAILED_USAGE_RETAINED'); }
  if (!Array.isArray(candidates) || candidates.length !== expectedCount ||
      new Set(candidates.map(c => c?.slug)).size !== expectedCount ||
      new Set(candidates.map(c => c?.backlogId)).size !== expectedCount ||
      candidates.some(c => !/^[a-z0-9-]+$/.test(c?.slug || '') || !/^[a-z0-9-]+$/.test(c?.backlogId || ''))) throw new Error('GUARDED_ISOLATED_BATCH_REQUIRED_USAGE_RETAINED');
  return { state: 'GENERATED_PENDING_REVIEW', providerCalls: 1, publicationAuthorized: false,
    candidates, batchDigest: documentDigest(candidates), budgetReceipt: completion };
}

export async function preflightReviewedEditorialBatch({ enabled = false, candidates, corpus,
  corpusCommit, receipts = [], verifyReviewProvenance, now = Date.now() } = {}) {
  if (enabled !== true) return { state: 'PAUSED_BY_DEFAULT', publicationAuthorized: false };
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 8 ||
      new Set(candidates.map(c => c?.slug)).size !== candidates.length ||
      new Set(candidates.map(c => c?.backlogId)).size !== candidates.length ||
      candidates.some(c => !/^[a-z0-9-]+$/.test(c?.slug || '') || !/^[a-z0-9-]+$/.test(c?.backlogId || ''))) throw new Error('NOVELTY_ISOLATED_BATCH_REQUIRED');
  const checks = [];
  for (const candidate of candidates) {
    if (corpus.some(d => d.slug === candidate.slug || d.backlogId && d.backlogId === candidate.backlogId)) return { state: 'NOVELTY_IDENTIFIER_ALREADY_PUBLISHED', publicationAuthorized: false };
    const gate = gateCandidate(candidate, [...corpus, ...candidates.filter(c => c.slug !== candidate.slug)]);
    if (gate.decision === 'REVIEW_REQUIRED') return { state: 'NOVELTY_OVERLAP_BLOCKED', publicationAuthorized: false,
      candidate: candidate.slug, pairs: gate.pairs };
    const receipt = receipts.find(r => r.candidateDigest === documentDigest(candidate));
    const review = verifyNoveltyReview({ receipt, candidate, corpus, corpusCommit, batch: candidates, now });
    if (!review.allowed) return { state: review.reason, publicationAuthorized: false, candidate: candidate.slug };
    // Content hashes establish integrity, not reviewer authority. A caller must
    // independently verify the receipt's trusted immutable review provenance.
    if (typeof verifyReviewProvenance !== 'function' || await verifyReviewProvenance(receipt) !== true) return { state: 'NOVELTY_REVIEW_PROVENANCE_UNVERIFIED', publicationAuthorized: false };
    checks.push(review.binding);
  }
  return { state: 'READY_FOR_EXISTING_QUALITY_GATES', noveltyPassed: true, publicationAuthorized: false,
    checks, note: 'Compiler, factual/source, SEO, visual, deployment and ledger gates remain mandatory.' };
}
