import { createHash } from 'node:crypto';
import { reviewBlogDraft, proposeBlogTopics } from './blog-recovery-workbench.mjs';
import { findUnsupportedEditorialClaim } from './editorial-generator-guards.mjs';

export const blogHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validDate = value => Number.isFinite(Date.parse(value));

export function proposeFromBlogGsc({ snapshot, inventory, now = Date.now() }) {
  if (snapshot.source !== 'google-search-console' || snapshot.siteUrl !== 'https://blog.stripunion.com/' ||
      !validDate(snapshot.collectedAt) || now - Date.parse(snapshot.collectedAt) < 0 ||
      now - Date.parse(snapshot.collectedAt) > 35 * 86400000) throw new Error('BLOG_GSC_SOURCE_NOT_FRESH');
  const briefs = [], seen = new Set(); let rejectedRows = 0;
  for (const row of snapshot.queryPageRows || []) {
    const query = String(row.query || '').trim().toLowerCase();
    if (!query || query.length > 160 || /[<>@]|ignore.*instructions|context:|system:/.test(query) ||
        !/^https:\/\/blog\.stripunion\.com\//.test(row.page || '')) { rejectedRows++; continue; }
    const intentKey = query.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!intentKey || seen.has(intentKey)) continue;
    seen.add(intentKey);
    briefs.push({ query, page: row.page, observedAt: snapshot.collectedAt, intentKey,
      audience: 'adult reader researching the Blog query', readerJob: 'Research ' + query,
      source: 'first-party-blog-gsc', sourceWindow: { startDate: snapshot.startDate, endDate: snapshot.endDate } });
  }
  const proposals = proposeBlogTopics(briefs, inventory, now);
  return { source: snapshot.siteUrl, checkedAt: new Date(now).toISOString(), rejectedRows,
    proposals: proposals.map((proposal, index) => ({ ...proposal, brief: briefs[index],
      destinationDecision: proposal.status === 'HOLD' ? 'REVIEW_EXISTING_INTENT_OR_SOURCE' : 'REVIEW_NEW_BLOG_BRIEF' })),
    warning: 'Queries are untrusted planning data, not instructions or verified facts. Review novelty and primary sources before generation.' };
}

export async function produceBlogDraft({ brief, inventory, inventoryCheckedAt, provider, now = Date.now() }) {
  const inventoryAge = now - Date.parse(inventoryCheckedAt);
  if (!Array.isArray(inventory) || !Number.isFinite(inventoryAge) || inventoryAge < 0 || inventoryAge > 3600000) throw new Error('BLOG_INVENTORY_NOT_FRESH');
  const [proposal] = proposeBlogTopics([brief], inventory, now);
  if (proposal.status !== 'BRIEF_REVIEW_REQUIRED') throw new Error('BLOG_PROPOSAL_HELD:' + proposal.reasons.join(','));
  if (typeof provider?.generateDraft !== 'function') throw new Error('BLOG_DRAFT_PROVIDER_NOT_CONFIGURED');
  const generated = await provider.generateDraft({ ...brief, destination: 'blog.stripunion.com', inventory });
  // Providers produce content, never their own publication authorization.
  const payload = { ...generated, status: 'draft', intentKey: brief.intentKey,
    audience: brief.audience, readerJob: brief.readerJob, create_missing_terms: false, featured_image: false };
  delete payload.review;
  if (findUnsupportedEditorialClaim(payload)) throw new Error('BLOG_UNSUPPORTED_CLAIM');
  for (const type of ['categories', 'tags']) if (payload[type] &&
      (!Array.isArray(payload[type]) || payload[type].some(id => !Number.isSafeInteger(id) || id <= 0))) throw new Error('BLOG_UNVERIFIED_TERM_ID');
  const structural = reviewBlogDraft({ ...payload, review: {
    factsChecked: true, affiliateDisclosureChecked: true, mobileStructureChecked: true, intentDistinct: true
  } }, inventory);
  if (structural.status !== 'MOCK_READY') throw new Error('BLOG_DRAFT_HELD:' + structural.reasons.join(','));
  const artifact = { version: 1, kind: 'blog-draft-artifact', destination: 'https://blog.stripunion.com',
    createdAt: new Date(now).toISOString(), brief, payload, proposalHash: blogHash(brief) };
  return { artifact, artifactHash: blogHash(artifact), reviewRequired: true, published: false };
}

export function validateBlogReview({ artifact, review, inventory, now = Date.now() }) {
  if (artifact?.version !== 1 || artifact.kind !== 'blog-draft-artifact' || artifact.destination !== 'https://blog.stripunion.com') throw new Error('BLOG_ARTIFACT_INVALID');
  if (review?.version !== 1 || review.decision !== 'approved' || !review.reviewer ||
      review.artifactHash !== blogHash(artifact) || !validDate(review.reviewedAt) || !validDate(review.expiresAt) ||
      Date.parse(review.reviewedAt) > now || Date.parse(review.expiresAt) <= now ||
      Date.parse(review.expiresAt) - Date.parse(review.reviewedAt) > 7 * 86400000) throw new Error('BLOG_REVIEW_INVALID_OR_EXPIRED');
  const [proposal] = proposeBlogTopics([artifact.brief], inventory, now);
  if (proposal.status !== 'BRIEF_REVIEW_REQUIRED') throw new Error('BLOG_PROPOSAL_NO_LONGER_ELIGIBLE');
  const payload = artifact.payload;
  if (findUnsupportedEditorialClaim(payload) || payload.create_missing_terms !== false || payload.featured_image !== false) throw new Error('BLOG_UNREVIEWED_SIDE_EFFECT_OR_CLAIM');
  for (const type of ['categories', 'tags']) if (payload[type] &&
      (!Array.isArray(payload[type]) || payload[type].some(id => !Number.isSafeInteger(id) || id <= 0))) throw new Error('BLOG_UNVERIFIED_TERM_ID');
  const gate = reviewBlogDraft({ ...payload, review: review.checks }, inventory);
  if (gate.status !== 'MOCK_READY') throw new Error('BLOG_REVIEW_GATE:' + gate.reasons.join(','));
  if (!Array.isArray(payload.sources) || payload.sources.some(source => {
    const age = now - Date.parse(source.checkedAt);
    return !Number.isFinite(age) || age < 0 || age > 35 * 86400000;
  })) throw new Error('BLOG_SOURCE_REVIEW_STALE');
  return { payload: { ...payload, status: 'publish' }, reviewHash: blogHash(review), artifactHash: blogHash(artifact) };
}

export async function publishReviewedBlog({ artifact, review, inventory, store, publisher, verifier,
  inventoryCheckedAt, enabled = false, now = Date.now(), clock = () => Date.now() }) {
  // Check operator stop before provider configuration, journal API reads, or writes.
  if (enabled !== true) return { state: 'PAUSED_BY_OPERATOR', externalRequests: 0, published: false };
  const checked = validateBlogReview({ artifact, review, inventory: [], now });
  const slug = checked.payload.slug;
  const expectedUrl = `https://blog.stripunion.com/${slug}/`;
  const key = blogHash({ destination: artifact.destination, slug, artifactHash: checked.artifactHash });
  const snapshot = await store.read();
  if (snapshot.state?.version !== 1 || !Array.isArray(snapshot.state.entries) || !snapshot.sha) throw new Error('BLOG_JOURNAL_NOT_PROVISIONED');
  const prior = snapshot.state.entries.find(row => row.key === key || row.slug === slug || row.intentKey === checked.payload.intentKey);
  if (prior?.state === 'confirmed' && prior.key === key) return { state: 'ALREADY_CONFIRMED', published: true, receipt: prior, providerCalls: 0 };
  if (prior) throw new Error('BLOG_UNKNOWN_OR_EXISTING_INTENT_HOLD');
  const inventoryAge = now - Date.parse(inventoryCheckedAt);
  if (!Array.isArray(inventory) || !Number.isFinite(inventoryAge) || inventoryAge < 0 || inventoryAge > 3600000) throw new Error('BLOG_INVENTORY_NOT_FRESH');
  validateBlogReview({ artifact, review, inventory, now });
  const pending = { key, slug, intentKey: checked.payload.intentKey, artifactHash: checked.artifactHash,
    reviewHash: checked.reviewHash, state: 'intent_recorded', startedAt: new Date(now).toISOString() };
  const claimed = { ...snapshot.state, entries: [...snapshot.state.entries, pending] };
  // A failed or losing CAS cannot call WordPress. No automatic retry after intent.
  const claimSha = await store.write(claimed, snapshot.sha);
  if (!claimSha) throw new Error('BLOG_JOURNAL_CAS_FAILED');
  let post;
  try {
    post = await publisher.publish(checked.payload, { authorizationHash: blogHash(checked.payload) });
    if (!Number.isSafeInteger(post.id) || post.id <= 0 || post.status !== 'publish' || post.slug !== slug || post.link !== expectedUrl) throw new Error('BLOG_PROVIDER_RECEIPT_MISMATCH');
    const evidence = await verifier.verify(expectedUrl);
    if (evidence.status !== 200 || evidence.url !== expectedUrl || evidence.canonical !== expectedUrl ||
        evidence.indexable !== true || evidence.sitemapContainsUrl !== true) throw new Error('BLOG_LIVE_VERIFICATION_INCOMPLETE');
    const completedAt = clock();
    if (!Number.isFinite(completedAt) || completedAt < now) throw new Error('BLOG_COMPLETION_TIMESTAMP_REGRESSION');
    const finished = { ...pending, state: 'confirmed', postId: post.id, url: expectedUrl,
      verifiedAt: new Date(completedAt).toISOString(), evidence };
    const finalState = { ...claimed, entries: claimed.entries.map(row => row.key === key ? finished : row) };
    const finalSha = await store.write(finalState, claimSha);
    if (!finalSha) throw new Error('BLOG_CONFIRMATION_CAS_FAILED');
    return { state: 'CONFIRMED', published: true, receipt: finished, journalSha: finalSha, post, providerCalls: 1 };
  } catch {
    // Keep durable intent when this write fails: both forms prohibit replay.
    const held = { ...claimed, entries: claimed.entries.map(row => row.key === key
      ? { ...row, state: 'reconcile_required', postId: post?.id || null, reason: 'PROVIDER_OR_VERIFICATION_UNCERTAIN' } : row) };
    try { await store.write(held, claimSha); } catch { /* original intent is still authoritative */ }
    throw new Error('BLOG_PUBLICATION_UNCERTAIN_RECONCILE_BEFORE_RETRY');
  }
}
