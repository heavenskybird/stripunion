import test from 'node:test';
import assert from 'node:assert/strict';
import { blogHash, produceBlogDraft, publishReviewedBlog, reconcileReviewedBlog, verifyBlogReadOnly, proposeFromBlogGsc } from '../blog-production-chain.mjs';
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
  return { ...bundle, store: journal, now, clock: () => now + 1000, enabled: true, inventory: [], inventoryCheckedAt: checkedAt, authorizeReviewer: async () => true, verificationOptions: {delayMs:0},
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
test('late sitemap uses bounded reads after one POST and retains provider ID before verification', async () => {
  const bundle = await artifact(), journal = store(); let posts = 0, reads = 0;
  const input = args(bundle,journal,{publisher:{publish:async p=>{posts++;return{id:77,status:'publish',slug:p.slug,link:verification(p.slug).url};}},
    verifier:{verify:async()=>{reads++;const row=(await journal.read()).state.entries[0];assert.equal(row.postId,77);assert.equal(row.state,'verifying');return{...verification(bundle.artifact.payload.slug),sitemapContainsUrl:reads>=2};}}});
  const result = await publishReviewedBlog(input);
  assert.equal(posts,1);assert.equal(reads,2);assert.equal(result.receipt.evidence.readOnlyAttempts,2);
});
test('exhausted verification preserves intent and ID, later reconcile closes with zero further POST', async () => {
  const bundle = await artifact(), journal = store();let posts=0,reads=0;
  const input=args(bundle,journal,{publisher:{publish:async p=>{posts++;return{id:78,status:'publish',slug:p.slug,link:verification(p.slug).url};}},
    verifier:{verify:async()=>{reads++;return{...verification(bundle.artifact.payload.slug),sitemapContainsUrl:false};}}});
  await assert.rejects(publishReviewedBlog(input),/UNCERTAIN/);
  assert.equal(reads,3);assert.equal(posts,1);
  const prior=(await journal.read()).state.entries[0];assert.equal(prior.state,'reconcile_required');assert.equal(prior.postId,78);
  await assert.rejects(publishReviewedBlog(input),/HOLD/);assert.equal(posts,1);
  const result=await reconcileReviewedBlog({...input,publisher:{publish:()=>{throw new Error('never POST');}},verifier:{verify:async()=>verification(bundle.artifact.payload.slug)}});
  assert.equal(result.providerCalls,0);assert.equal(result.receipt.postId,78);assert.equal(result.receipt.key,prior.key);assert.equal(result.state,'CONFIRMED');assert.equal(posts,1);
  assert.equal((await reconcileReviewedBlog(input)).state,'ALREADY_CONFIRMED');
});
test('reconcile failure remains held, unproven post ID and unbounded read settings refused', async()=>{
  await assert.rejects(verifyBlogReadOnly({verifier:{},url:'https://blog.stripunion.com/x/',maxAttempts:6}),/BOUNDS/);
  const bundle=await artifact(),journal=store();
  await assert.rejects(publishReviewedBlog(args(bundle,journal,{verifier:{verify:async()=>({...verification(bundle.artifact.payload.slug),sitemapContainsUrl:false})}})),/UNCERTAIN/);
  await assert.rejects(reconcileReviewedBlog(args(bundle,journal,{verifier:{verify:async()=>{throw new Error('read timeout');}}})),/ALERT_NO_REPOST/);
  assert.equal((await journal.read()).state.entries[0].state,'reconcile_required');
  const snap=await journal.read();snap.state.entries[0].providerReceiptVerified=false;await journal.write(snap.state,snap.sha);
  await assert.rejects(reconcileReviewedBlog(args(bundle,journal)),/NOT_PROVEN/);
});

test('lost CAS acknowledgement after one POST never permits a second POST', async () => {
  for (const persisted of [false, true]) {
    const bundle = await artifact(), durable = store(); let writes = 0, posts = 0;
    const journal = { read: durable.read, write: async (state, sha) => {
      writes++;
      if (writes === 2) {
        if (persisted) await durable.write(state, sha);
        throw new Error('ambiguous network acknowledgement');
      }
      return durable.write(state, sha);
    } };
    const input = args(bundle, journal, { publisher: { publish: async p => {
      posts++; return { id: 79, status: 'publish', slug:p.slug, link:verification(p.slug).url };
    } } });
    await assert.rejects(publishReviewedBlog(input), /UNCERTAIN/);
    await assert.rejects(publishReviewedBlog(input), /HOLD/);
    assert.equal(posts, 1);
    const held = (await durable.read()).state.entries[0];
    assert.ok(['verifying','reconcile_required'].includes(held.state));
    assert.equal(held.postId,79);
    assert.equal((await reconcileReviewedBlog(args(bundle,durable))).state,'CONFIRMED');
    assert.equal(posts,1);
  }
});

test('two publishers racing a single snapshot produce only one external POST', async () => {
  const bundle = await artifact(), durable = store(); let arrivals=0, release;
  const barrier = new Promise(resolve => { release=resolve; });
  const journal = { read: async () => {
    const snap = await durable.read(); arrivals++; if(arrivals===2) release(); await barrier; return snap;
  }, write:durable.write };
  let posts=0;
  const input = args(bundle,journal,{publisher:{publish:async p=>{
    posts++;return{id:80,status:'publish',slug:p.slug,link:verification(p.slug).url};
  }}});
  const results=await Promise.allSettled([publishReviewedBlog(input),publishReviewedBlog(input)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(posts,1);
  assert.equal((await durable.read()).state.entries[0].state,'confirmed');
});

test('live verifier finds post in paginated sitemap without foreign fetches or writes', async () => {
  const url = 'https://blog.stripunion.com/approved-new-post/';
  const requests = [];
  const result = await wordpressLiveVerifier({fetchImpl: async (request, options={}) => {
    requests.push({request,method:options.method||'GET'});
    if(request===url)return new Response(`<link rel="canonical" href="${url}">`);
    if(request.endsWith('/sitemap_index.xml'))return new Response('<sitemapindex><sitemap><loc>https://blog.stripunion.com/post-sitemap2.xml</loc></sitemap><sitemap><loc>https://foreign.invalid/posts.xml</loc></sitemap></sitemapindex>');
    if(request.endsWith('/post-sitemap2.xml'))return new Response(`<urlset><url><loc>${url}</loc></url></urlset>`);
    return new Response('',{status:404});
  }}).verify(url);
  assert.equal(result.sitemapContainsUrl,true);
  assert.ok(requests.every(r=>r.method==='GET' && r.request.startsWith('https://blog.stripunion.com/')));
  assert.ok(requests.length<=13);
});

test('observed query-page pair prioritizes its existing Blog landing page, not a duplicate article', () => {
 const snapshot={source:'google-search-console',siteUrl:'https://blog.stripunion.com/',collectedAt:checkedAt,queryPageRows:[{query:'sites like adultfriendfinder',page:'https://blog.stripunion.com/sites-like-adultfriendfinder/'}]};
 const result=proposeFromBlogGsc({snapshot,inventory:[{destination:'blog',slug:'sites-like-adultfriendfinder',postId:45,title:'Existing comparison'}],now});
 assert.equal(result.proposals[0].status,'HOLD');assert.equal(result.proposals[0].destinationDecision,'UPDATE_EXISTING_BLOG');assert.equal(result.proposals[0].existingLandingPage.postId,45);
 const distinct=proposeFromBlogGsc({snapshot,inventory:[{destination:'blog',slug:'adultfriendfinder-app',title:'AdultFriendFinder mobile app'}],now});
 assert.equal(distinct.proposals[0].destinationDecision,'REVIEW_NEW_BLOG_BRIEF');
});
