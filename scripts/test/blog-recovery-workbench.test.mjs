import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBlogTopics, reviewBlogDraft, simulateBlogPublication } from '../blog-recovery-workbench.mjs';

const draft = (slug = 'offline-fixture-one') => ({ slug, title: 'Example independent research workflow',
  excerpt: 'Offline fixture only', status: 'draft', intentKey: slug, audience: 'researcher', readerJob: 'inspect source retention notices',
  content: Array.from({ length: 5 }, (_, i) => `<h2>Section ${i}</h2><p>${'Substantive fixture words '.repeat(80)}</p>`).join(''),
  sources: [{ url: 'https://example.org/policy', primary: true, checkedAt: '2026-11-12T00:00:00Z' }],
  review: { factsChecked: true, affiliateDisclosureChecked: true, mobileStructureChecked: true, intentDistinct: true } });
const receipt = slug => ({ mode: 'mock', outcome: 'success', httpStatus: 200, postId: 1001,
  url: `https://blog.stripunion.com/${slug}/`, canonical: `https://blog.stripunion.com/${slug}/`, indexable: true, sitemapContainsUrl: true });
test('planning holds Main signals, stale evidence, and occupied Blog/Astro intent', () => {
  const base = { query: 'retention research', page: 'https://blog.stripunion.com/topic/', intentKey: 'retention', audience: 'reader', readerJob: 'review retention policy', observedAt: '2026-11-11T00:00:00Z' };
  const inventory = [{ slug: 'occupied', intentKey: 'retention', title: 'retention policy', destination: 'astro' }];
  const result = proposeBlogTopics([base, { ...base, page: 'https://stripunion.com/guides/topic/' }, { ...base, observedAt: '2026-01-01' }], inventory, Date.parse('2026-11-12'));
  assert.ok(result.every(r => r.status === 'HOLD'));
  assert.ok(result[1].reasons.includes('NOT_BLOG_SIGNAL'));
  assert.ok(result[2].reasons.includes('SIGNAL_NOT_FRESH'));
});
test('legacy payload without intent and bound editorial review is held', () => {
  assert.equal(reviewBlogDraft({ slug: 'old-draft', content: '<p>old</p>', status: 'publish' }).status, 'HOLD');
  const bad = draft(); bad.content += '<script>alert(1)</script>';
  assert.ok(reviewBlogDraft(bad).reasons.includes('UNSAFE_HTML'));
  assert.ok(reviewBlogDraft(draft(), [{ slug: 'occupied', intentKey: 'offline-fixture-one' }]).reasons.includes('DUPLICATE_OR_EXISTING_INTENT'));
});
test('two distinct simulated cycles, replay no-op, stale writer rejected; zero transport', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('External transport forbidden'); };
  try {
    let journal = { revision: 0, entries: [] };
    for (const slug of ['fixture-first-cycle', 'fixture-second-cycle']) {
      const d = draft(slug), review = reviewBlogDraft(d);
      const result = simulateBlogPublication({ draft: d, review, journal, expectedRevision: journal.revision, receipt: receipt(slug) });
      assert.equal(result.action, 'MOCK_CONFIRMED'); assert.equal(result.livePublicationAccepted, false);
      journal = result.journal;
      assert.equal(simulateBlogPublication({ draft: d, review, journal, expectedRevision: journal.revision, receipt: receipt(slug) }).action, 'NOOP_ALREADY_CONFIRMED');
      assert.throws(() => simulateBlogPublication({ draft: d, review, journal, expectedRevision: 0, receipt: receipt(slug) }), /CAS/);
    }
    assert.equal(journal.entries.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
test('changed review, bad canonical, missing sitemap and uncertain acceptance cannot replay', () => {
  const d = draft(), review = reviewBlogDraft(d), journal = { revision: 0, entries: [] };
  const args = { draft: d, review, journal, expectedRevision: 0 };
  assert.throws(() => simulateBlogPublication({ ...args, draft: { ...d, content: d.content + 'changed' }, receipt: receipt(d.slug) }), /REVIEW/);
  assert.throws(() => simulateBlogPublication({ ...args, receipt: { ...receipt(d.slug), canonical: 'https://elsewhere.example/' } }), /VERIFIED/);
  assert.throws(() => simulateBlogPublication({ ...args, receipt: { ...receipt(d.slug), sitemapContainsUrl: false } }), /VERIFIED/);
  const held = simulateBlogPublication({ ...args, receipt: { mode: 'mock', outcome: 'unknown' } });
  assert.equal(held.action, 'HOLD_UNKNOWN_NO_REPLAY');
  assert.throws(() => simulateBlogPublication({ ...args, journal: held.journal, expectedRevision: 1, receipt: receipt(d.slug) }), /HOLD/);
});
