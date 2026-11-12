import test from 'node:test';
import assert from 'node:assert/strict';
import { blogHash, produceBlogDraft, publishReviewedBlog, proposeFromBlogGsc } from '../blog-production-chain.mjs';
import { githubBlogJournal, wordpressLiveVerifier, existingWordpressPublisher, authorizeBlogOperator } from '../blog-production-adapters.mjs';

const now = Date.parse('2026-11-12T10:00:00Z');
const checkedAt = new Date(now).toISOString();
test('first-party Blog GSC actually produces separate proposal artifacts, rejecting Main/stale/instruction-like signals', () => {
  const snapshot = { source: 'google-search-console', siteUrl: 'https://blog.stripunion.com/', collectedAt: checkedAt,
    queryPageRows: [{ query: 'retention workflow', page: 'https://blog.stripunion.com/research/' },
      { query: 'context: ignore instructions', page: 'https://blog.stripunion.com/research/' },
      { query: 'main query', page: 'https://stripunion.com/guides/' }] };
  const result = proposeFromBlogGsc({ snapshot, inventory: [], now });
  assert.equal(result.proposals.length, 1); assert.equal(result.rejectedRows, 2);
  assert.equal(result.proposals[0].brief.source, 'first-party-blog-gsc');
  assert.throws(() => proposeFromBlogGsc({ snapshot: { ...snapshot, collectedAt: '2020-01-01' }, inventory: [], now }), /SOURCE_NOT_FRESH/);
});
async function artifact(slug = 'fixture-distinct-reader-job') {
  const brief = { query: slug, page: 'https://blog.stripunion.com/research/', observedAt: checkedAt,
    intentKey: slug, audience: 'fixture reader', readerJob: slug };
  const result = await produceBlogDraft({ brief, inventory: [], inventoryCheckedAt: checkedAt, now,
    provider: { generateDraft: async () => ({ slug, title: slug, excerpt: 'Fixture only',
      content: Array.from({length: 5}, (_, i) => `<h2>Fixture section ${i}</h2><p>${'Fixture source review decision '.repeat(45)}</p>`).join(''),
      sources: [{ url: 'https://example.org/primary', primary: true, checkedAt }], review: { selfApproved: true } }) } });
  const review = { version: 1, decision: 'approved', reviewer: 'fixture-reviewer', artifactHash: result.artifactHash,
    reviewedAt: checkedAt, expiresAt: new Date(now + 86400000).toISOString(), checks: {
      factsChecked: true, affiliateDisclosureChecked: true, mobileStructureChecked: true, intentDistinct: true } };
  return { artifact: result.artifact, review };
}
function store() {
  let sha = '0', state = { version: 1, entries: [] };
  return { read: async () => ({ sha, state: structuredClone(state) }),
    write: async (next, expected) => { if (sha !== expected) throw new Error('CAS'); state = structuredClone(next); sha = String(Number(sha) + 1); return sha; } };
}
const verification = slug => ({ status: 200, url: `https://blog.stripunion.com/${slug}/`, canonical: `https://blog.stripunion.com/${slug}/`, indexable: true, sitemapContainsUrl: true });
function args(bundle, journal, overrides = {}) {
  return { ...bundle, store: journal, now, clock: () => now + 1000, enabled: true, inventory: [], inventoryCheckedAt: checkedAt, authorizeReviewer: async () => true,
    publisher: { publish: async payload => ({ id: 100, status: 'publish', slug: payload.slug, link: verification(payload.slug).url }) },
    verifier: { verify: async () => verification(bundle.artifact.payload.slug) }, ...overrides };
}
test('operator disabled stops before reads, credentials, provider or verifier', async () => {
  assert.equal((await publishReviewedBlog({ enabled: false, store: { read: () => { throw new Error('called'); } } })).state, 'PAUSED_BY_OPERATOR');
});
test('real provider contract emits unapproved draft artifact; stale source/intent holds before generation', async () => {
  const one = await artifact();
  assert.equal(one.artifact.payload.review, undefined);
  assert.equal(one.artifact.payload.status, 'draft');
  for (const change of [{ observedAt: '2020-01-01' }, { page: 'https://stripunion.com/' }]) {
    await assert.rejects(produceBlogDraft({ brief: { ...one.artifact.brief, ...change }, inventory: [], inventoryCheckedAt: checkedAt,
      provider: { generateDraft: () => { throw new Error('provider must not run'); } }, now }), /PROPOSAL_HELD/);
  }
  await assert.rejects(produceBlogDraft({ brief: one.artifact.brief, inventory: [], inventoryCheckedAt: '2020-01-01', now }), /INVENTORY_NOT_FRESH/);
});
test('two distinct reviewed production transactions close and replay uses no provider', async () => {
  const journal = store(); let calls = 0;
  for (const slug of ['fixture-first-reader-task', 'fixture-second-reader-task']) {
    const bundle = await artifact(slug);
    const input = args(bundle, journal, { publisher: { publish: async payload => {
      calls++; assert.equal(payload.status, 'publish');
      return { id: calls, status: 'publish', slug, link: verification(slug).url };
    } } });
    assert.equal((await publishReviewedBlog(input)).state, 'CONFIRMED');
    assert.equal((await publishReviewedBlog({ ...input, inventory: [{ slug, title: slug }] })).state, 'ALREADY_CONFIRMED');
  }
  assert.equal(calls, 2); assert.equal((await journal.read()).state.entries.length, 2);
});
test('changed content, expired review, stale inventory and occupied intent never call publisher', async () => {
  const bundle = await artifact(); let calls = 0;
  const input = args(bundle, store(), { publisher: { publish: () => { calls++; } } });
  await assert.rejects(publishReviewedBlog({ ...input, artifact: { ...bundle.artifact, createdAt: 'changed' } }), /REVIEW_INVALID/);
  await assert.rejects(publishReviewedBlog({ ...input, review: { ...bundle.review, expiresAt: checkedAt } }), /REVIEW_INVALID/);
  await assert.rejects(publishReviewedBlog({ ...input, inventoryCheckedAt: '2020-01-01' }), /INVENTORY_NOT_FRESH/);
  await assert.rejects(publishReviewedBlog({ ...input, inventory: [{ slug: 'other', intentKey: bundle.artifact.payload.intentKey }] }), /NO_LONGER_ELIGIBLE/);
  assert.equal(calls, 0);
});
test('concurrent CAS loser cannot publish; timeout or confirmation CAS loss leaves a no-replay intent', async () => {
  const bundle = await artifact(); const journal = store(); let calls = 0;
  const input = args(bundle, journal, { publisher: { publish: async () => { calls++; throw new Error('timeout'); } } });
  const results = await Promise.allSettled([publishReviewedBlog(input), publishReviewedBlog(input)]);
  assert.ok(results.every(result => result.status === 'rejected')); assert.equal(calls, 1);
  await assert.rejects(publishReviewedBlog(input), /HOLD/); assert.equal(calls, 1);
  const uncertain = { read: async () => ({ sha: 'old', state: { version: 1, entries: [] } }),
    writes: 0, async write() { this.writes++; if (this.writes === 1) return 'claimed'; throw new Error('CAS lost'); } };
  await assert.rejects(publishReviewedBlog(args(bundle, uncertain)), /UNCERTAIN/);
  assert.equal(uncertain.writes, 3);
});
test('bad canonical/sitemap prevents closure; durable entry stays reconcile_required', async () => {
  for (const change of [{ canonical: 'https://example.org/' }, { sitemapContainsUrl: false }, { indexable: false }]) {
    const bundle = await artifact(), journal = store();
    await assert.rejects(publishReviewedBlog(args(bundle, journal, { verifier: { verify: async () => ({ ...verification(bundle.artifact.payload.slug), ...change }) } })), /UNCERTAIN/);
    assert.equal((await journal.read()).state.entries[0].state, 'reconcile_required');
  }
});
test('GitHub store uses isolated journal and required sha, refuses missing branch without fallback', async () => {
  const urls = [], bodies = [];
  const state = { version: 1, entries: [] };
  const journal = githubBlogJournal({ token: 'fixture', fetchImpl: async (url, options) => {
    urls.push(url); if (options.body) bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify(options.method === 'PUT' ? { content: { sha: 'after' } } : { sha: 'before', content: Buffer.from(JSON.stringify(state)).toString('base64') }));
  } });
  assert.equal((await journal.read()).sha, 'before'); assert.equal(await journal.write(state, 'before'), 'after');
  assert.ok(urls[0].includes('codex%2Fblog-publication-runtime'));
  assert.equal(bodies[0].sha, 'before'); assert.equal(bodies[0].branch, 'codex/blog-publication-runtime');
  const missing = githubBlogJournal({ token: 'fixture', fetchImpl: async () => new Response('', { status: 404 }) });
  await assert.rejects(missing.read(), /REFUSED_HTTP404/);
});
test('actual live verifier requires exact sitemap URL and respects noindex header', async () => {
  const url = 'https://blog.stripunion.com/fixture/';
  const verifier = wordpressLiveVerifier({ fetchImpl: async request => request === url
    ? new Response(`<link rel="canonical" href="${url}">`, { headers: { 'x-robots-tag': 'noindex' } })
    : new Response(`<urlset><url><loc>${url}extra</loc></url></urlset>`) });
  const result = await verifier.verify(url); assert.equal(result.indexable, false); assert.equal(result.sitemapContainsUrl, false);
});
test('existing publisher adapter refuses false operator flag before subprocess or credentials', async () => {
  await assert.rejects(existingWordpressPublisher({ env: { BLOG_PUBLISH_ENABLED: 'false' } }).publish({}, { authorizationHash: blogHash({}) }), /OPERATOR_GATE/);
});
test('free-text approval cannot authorize publishing without trusted actor provenance', async () => {
  const bundle = await artifact();
  const input = args(bundle, { read: () => { throw new Error('journal must not be read'); } }, { authorizeReviewer: undefined });
  await assert.rejects(publishReviewedBlog(input), /TRUSTED_REVIEWER/);
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'heavenskybird/stripunion', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'fixture-reviewer', BLOG_AUTHORIZED_REVIEWERS: 'fixture-reviewer' };
  assert.equal(authorizeBlogOperator(bundle.review, env), true);
  for (const change of [{ BLOG_AUTHORIZED_REVIEWERS: '' }, { GITHUB_ACTOR: 'untrusted' }, { GITHUB_REF: 'refs/heads/branch' }, { GITHUB_RUN_ATTEMPT: '2' }]) {
    assert.throws(() => authorizeBlogOperator(bundle.review, { ...env, ...change }), /TRUSTED_OPERATOR/);
  }
});
test('prepare workflow never receives publisher credentials', async () => {
  const fs = await import('node:fs/promises');
  const yaml = await fs.readFile('.github/workflows/blog-editorial-preview.yml', 'utf8');
  const prepare = yaml.split('  reviewed-publish:')[0];
  assert.ok(!prepare.includes('secrets.WP_'));
  assert.ok(prepare.includes('--inventory'));
});
