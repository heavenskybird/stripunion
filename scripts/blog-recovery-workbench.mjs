// Offline recovery workbench. No fetch, credentials, WordPress writes, or queue writes.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const words = value => String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
const text = value => String(value || '').replace(/<[^>]*>/g, ' ');
const overlap = (a, b) => {
  const left = new Set(words(a)), right = new Set(words(b));
  return left.size && right.size ? [...left].filter(w => right.has(w)).length / Math.min(left.size, right.size) : 0;
};

export function proposeBlogTopics(signals, inventory, now = Date.now()) {
  return signals.map(signal => {
    const reasons = [];
    if (!signal.intentKey || !signal.audience || !signal.readerJob) reasons.push('MISSING_INTENT_BRIEF');
    if (!/^https:\/\/blog\.stripunion\.com\//.test(signal.page || '')) reasons.push('NOT_BLOG_SIGNAL');
    const age = now - Date.parse(signal.observedAt);
    if (!Number.isFinite(age) || age < 0 || age > 35 * 86400000) reasons.push('SIGNAL_NOT_FRESH');
    const conflicts = inventory.filter(row => row.intentKey === signal.intentKey ||
      overlap(signal.readerJob + ' ' + signal.query, row.title + ' ' + row.readerJob) >= 0.8);
    if (conflicts.length) reasons.push('EXISTING_INTENT_REVIEW');
    return { query: signal.query, intentKey: signal.intentKey, audience: signal.audience,
      readerJob: signal.readerJob, status: reasons.length ? 'HOLD' : 'BRIEF_REVIEW_REQUIRED', reasons,
      conflicts: conflicts.map(row => ({ slug: row.slug, destination: row.destination })),
      note: 'Candidate only; impressions are planning evidence, never publishable factual claims.' };
  });
}

export function reviewBlogDraft(draft, inventory = []) {
  const reasons = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug || '')) reasons.push('INVALID_SLUG');
  if (!draft.intentKey || !draft.audience || !draft.readerJob) reasons.push('MISSING_INTENT_BRIEF');
  if (draft.status !== 'draft') reasons.push('DRAFT_ONLY_WORKBENCH');
  if (!draft.title || !draft.excerpt) reasons.push('MISSING_METADATA');
  if (words(text(draft.content)).length < 700) reasons.push('CONTENT_TOO_SHORT');
  if ((String(draft.content || '').match(/<h2\b/gi) || []).length < 5) reasons.push('INSUFFICIENT_SECTIONS');
  if (/<(?:script|iframe|form)\b|\bon\w+\s*=|javascript:/i.test(draft.content || '')) reasons.push('UNSAFE_HTML');
  if (!Array.isArray(draft.sources) || !draft.sources.length || draft.sources.some(s =>
    !/^https:\/\//.test(s.url || '') || s.primary !== true || !Number.isFinite(Date.parse(s.checkedAt)))) reasons.push('PRIMARY_SOURCE_REVIEW_REQUIRED');
  if (draft.review?.factsChecked !== true || draft.review?.affiliateDisclosureChecked !== true ||
      draft.review?.mobileStructureChecked !== true || draft.review?.intentDistinct !== true) reasons.push('EDITORIAL_REVIEW_REQUIRED');
  const conflicts = inventory.filter(row => row.slug === draft.slug || row.intentKey === draft.intentKey ||
    overlap(draft.title + ' ' + draft.readerJob, row.title + ' ' + row.readerJob) >= 0.8);
  if (conflicts.length) reasons.push('DUPLICATE_OR_EXISTING_INTENT');
  return { status: reasons.length ? 'HOLD' : 'MOCK_READY', reasons,
    contentHash: digest(draft), conflicts: conflicts.map(row => row.slug),
    limitation: 'Structured review assertions are supplied by a reviewer; this tool does not verify facts or semantic originality.' };
}

export function simulateBlogPublication({ draft, review, journal, expectedRevision, receipt }) {
  if (!Number.isSafeInteger(journal.revision) || journal.revision !== expectedRevision) throw new Error('JOURNAL_CAS_CONFLICT');
  if (review.status !== 'MOCK_READY' || review.contentHash !== digest(draft)) throw new Error('REVIEW_NOT_BOUND_TO_DRAFT');
  const key = digest({ destination: 'blog.stripunion.com', slug: draft.slug, contentHash: review.contentHash });
  const prior = journal.entries.find(row => row.key === key || row.slug === draft.slug);
  if (prior?.state === 'confirmed' && prior.key === key) return { action: 'NOOP_ALREADY_CONFIRMED', journal, externalRequests: 0 };
  if (prior) throw new Error('EXISTING_OR_UNKNOWN_PUBLICATION_HOLD');
  if (!receipt || receipt.mode !== 'mock') throw new Error('MOCK_RECEIPT_REQUIRED');
  const row = { key, slug: draft.slug, state: 'intent_recorded', contentHash: review.contentHash };
  const next = { revision: journal.revision + 1, entries: [...journal.entries, row] };
  if (receipt.outcome === 'unknown') {
    row.state = 'reconcile_required';
    return { action: 'HOLD_UNKNOWN_NO_REPLAY', journal: next, externalRequests: 0 };
  }
  const expectedUrl = `https://blog.stripunion.com/${draft.slug}/`;
  if (receipt.outcome !== 'success' || receipt.httpStatus !== 200 || receipt.url !== expectedUrl ||
      receipt.canonical !== expectedUrl || receipt.indexable !== true || receipt.sitemapContainsUrl !== true ||
      !Number.isSafeInteger(receipt.postId) || receipt.postId <= 0) throw new Error('MOCK_PUBLICATION_NOT_VERIFIED');
  row.state = 'confirmed';
  row.postId = receipt.postId;
  row.url = receipt.url;
  row.simulated = true;
  return { action: 'MOCK_CONFIRMED', journal: next, externalRequests: 0,
    livePublicationAccepted: false, distribution: 'DISABLED',
    note: 'Simulation never authorizes production publication or creates a production ledger receipt.' };
}

export async function auditBlogRepository(root = '.') {
  const list = async path => (await fs.readdir(`${root}/${path}`)).filter(name => name.endsWith('.json')).sort();
  const queue = await list('ops/editorial/wordpress-queue');
  const ledger = await list('ops/editorial/publication-ledger/wordpress');
  const published = [];
  for (const name of ledger) {
    const record = JSON.parse(await fs.readFile(`${root}/ops/editorial/publication-ledger/wordpress/${name}`, 'utf8'));
    if (record.status === 'publish') published.push({ slug: record.slug, postId: record.post_id, recordedAt: record.recorded_at });
  }
  return { mode: 'OFFLINE_READ_ONLY', queueFiles: queue, ledgerFiles: ledger,
    publishedLedger: published, newestRecordedPublication: published.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0] || null,
    astroGuideCount: (await fs.readdir(`${root}/src/data/guides`)).filter(n => n.endsWith('.js')).length,
    externalRequests: 0, unattendedBlogEnabledByThisTool: false,
    warning: 'Repository publication timestamps are not a fresh WordPress REST inventory or proof of live availability.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await auditBlogRepository(), null, 2));
