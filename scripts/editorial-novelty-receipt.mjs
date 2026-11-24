import { createHash } from 'node:crypto';
import { gateCandidate } from './content-novelty-audit.mjs';

function canonical(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new Error('NOVELTY_NON_JSON_DOCUMENT');
}
export const documentDigest = value => createHash('sha256').update(canonical(value)).digest('hex');
function inventoryDigest(docs) {
  if (!Array.isArray(docs) || new Set(docs.map(d => d.slug)).size !== docs.length) throw new Error('NOVELTY_DUPLICATE_INVENTORY');
  return documentDigest(docs.map(d => [d.slug, documentDigest(d)]).sort((a, b) => a[0].localeCompare(b[0])));
}
export function noveltyBinding({ candidate, corpus, corpusCommit, batch = [candidate] }) {
  if (!/^[a-f0-9]{40}$/.test(corpusCommit || '')) throw new Error('NOVELTY_CORPUS_COMMIT_REQUIRED');
  if (!candidate || !/^[a-z0-9-]+$/.test(candidate.slug || '')) throw new Error('NOVELTY_CANDIDATE_ID_REQUIRED');
  return { policyVersion: 'intent-v1', candidateDigest: documentDigest(candidate),
    corpusDigest: inventoryDigest(corpus), corpusCommit, batchDigest: inventoryDigest(batch) };
}
export function createNoveltyReview({ candidate, corpus, corpusCommit, batch = [candidate], reviewer,
  reviewedAt = Date.now(), expiresAt = reviewedAt + 60 * 60_000 }) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(reviewer || '')) throw new Error('NOVELTY_REVIEWER_REQUIRED');
  if (corpus.some(d => d.slug === candidate.slug || d.backlogId && d.backlogId === candidate.backlogId)) throw new Error('NOVELTY_IDENTIFIER_ALREADY_PUBLISHED');
  const binding = noveltyBinding({ candidate, corpus, corpusCommit, batch });
  const gate = gateCandidate(candidate, [...corpus, ...batch.filter(d => d.slug !== candidate.slug)]);
  return { version: 1, ...binding, reviewer, reviewedAt: new Date(reviewedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(), decision: gate.decision === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'APPROVED',
    gateDecision: gate.decision, overlapPairs: gate.pairs.map(p => ({ left: p.left, right: p.right, score: p.score })) };
}
export function verifyNoveltyReview({ receipt, candidate, corpus, corpusCommit, batch = [candidate], now = Date.now() }) {
  const deny = reason => ({ allowed: false, reason });
  const expected = noveltyBinding({ candidate, corpus, corpusCommit, batch });
  if (corpus.some(d => d.slug === candidate.slug || d.backlogId && d.backlogId === candidate.backlogId)) return deny('NOVELTY_IDENTIFIER_ALREADY_PUBLISHED');
  if (!receipt || receipt.version !== 1 || receipt.decision !== 'APPROVED') return deny('NOVELTY_REVIEW_NOT_APPROVED');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(receipt.reviewer || '')) return deny('NOVELTY_REVIEWER_REQUIRED');
  for (const [key, value] of Object.entries(expected)) if (receipt[key] !== value) return deny('NOVELTY_REVIEW_STALE_BINDING');
  const start = Date.parse(receipt.reviewedAt), end = Date.parse(receipt.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= now || end - start > 24 * 60 * 60_000 || end <= start) return deny('NOVELTY_REVIEW_EXPIRED_OR_INVALID');
  // Approval metadata cannot override an overlap result. Replace/retarget a
  // candidate and obtain a new content-bound review instead.
  const gate = gateCandidate(candidate, [...corpus, ...batch.filter(d => d.slug !== candidate.slug)]);
  return gate.decision === 'REVIEW_REQUIRED' ? deny('NOVELTY_OVERLAP_BLOCKED') : { allowed: true, reason: 'NOVELTY_REVIEW_BOUND', binding: expected };
}
