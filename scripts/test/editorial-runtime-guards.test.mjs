import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { githubContentsBudgetStore, reserveEditorialRequest } from '../editorial-budget-journal.mjs';
import { guardedEditorialGeneration, preflightReviewedEditorialBatch } from '../editorial-guarded-generation.mjs';
import { createNoveltyReview, verifyNoveltyReview } from '../editorial-novelty-receipt.mjs';
import { reviewedPreflightCommand } from '../editorial-reviewed-preflight.mjs';

const now = Date.parse('2026-11-12T10:00:00Z');
// Fixture rates, credit and tokenizer evidence are not production verification.
const config = { version: 1, models: { fixture: { verified: true, sourceUrl: 'https://openai.com/api/pricing/',
  verifiedAt: '2026-11-12T09:00:00Z', expiresAt: '2026-11-13T00:00:00Z', inputUsdPerMillion: 1, outputUsdPerMillion: 2 } } };
const limits = { batchRequests: 3, batchOutputTokens: 60_000, dailyRequests: 3, dailyTokens: 200_000, batchUsd: 1, dailyUsd: 1 };
const input = 'private fixture prompt';
const tokenEvidence = { verified: true, tokenizerVersion: 'fixture-v1', model: 'fixture',
  inputDigest: createHash('sha256').update(input).digest('hex'), upperBoundTokens: 30_000 };
const seed = () => ({ version: 1, currency: 'USD', creditProof: { id: 'fixture-proof', verified: true,
  availableUsd: 1, observedAt: new Date(now).toISOString(), source: 'OPERATOR_VERIFIED_BILLING', providerScopeDigest: 'b'.repeat(64) }, entries: [] });
function fixtureStore({ state = seed(), beforeWrite, failWrite, failRead } = {}) {
  let current = structuredClone(state), revision = 1;
  const writes = [], reads = [];
  const sha = () => revision.toString(16).padStart(40, '0');
  const store = githubContentsBudgetStore({ api: async (endpoint, method, body) => {
    assert.ok(endpoint.includes('editorial-budget-journal.json'));
    if (method === 'GET') {
      reads.push(endpoint);
      if (failRead?.(reads.length)) throw new Error('private transport data');
      return { sha: sha(), encoding: 'base64', content: Buffer.from(JSON.stringify(current)).toString('base64') };
    }
    assert.equal(method, 'PUT');
    assert.equal(body.branch, 'codex/editorial-budget-runtime');
    assert.ok(!endpoint.includes('editorial-r1-receipt'));
    await beforeWrite?.(body);
    if (failWrite?.(writes.length + 1)) throw new Error('private transport data');
    if (body.sha !== sha()) throw new Error('409 CAS conflict');
    current = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    writes.push(body); revision++;
    return { content: { sha: sha() } };
  } });
  return { store, writes, reads, get state() { return structuredClone(current); } };
}
const request = store => ({ enabled: true, store, batchId: 'fixture-batch', attempt: 1, input, model: 'fixture', tokenEvidence,
  maxOutputTokens: 20_000, config, limits, now, expectedCount: 1, providerScopeDigest: 'b'.repeat(64),
  parseCandidates: response => response.candidates });
const candidate = { slug: 'new-account-recovery', backlogId: 'new-account-recovery', title: 'Account password recovery',
  keyTakeaways: ['Recover access through the documented password reset.'], sections: [{ heading: 'Recovery route', paragraphs: ['Check account recovery email access.'] }] };
const response = (candidates = [candidate]) => ({ status: 'completed', usage: { input_tokens: 20_000, output_tokens: 10_000 }, candidates });
test('default pause and unverified rates/credit/input/initial state make zero provider calls', async () => {
  let calls = 0; const provider = async () => { calls++; return response(); };
  const f = fixtureStore();
  assert.equal((await guardedEditorialGeneration({ ...request(f.store), enabled: false, provider })).state, 'PAUSED_BY_DEFAULT');
  assert.equal(f.reads.length, 0);
  await assert.rejects(guardedEditorialGeneration({ ...request(f.store), config: {version:1,models:{}}, provider }), /VERIFIED_PRICE_UNKNOWN/);
  await assert.rejects(guardedEditorialGeneration({ ...request(f.store), tokenEvidence: {...tokenEvidence, verified:false}, provider }), /INPUT_BOUND_UNVERIFIED/);
  await assert.rejects(guardedEditorialGeneration({ ...request(f.store), providerScopeDigest:'c'.repeat(64), provider }), /PROVIDER_SCOPE_UNVERIFIED/);
  const stale = fixtureStore({ state: {...seed(),creditProof:{...seed().creditProof, observedAt:'2026-11-12T09:00:00Z'}} });
  await assert.rejects(guardedEditorialGeneration({ ...request(stale.store), provider }), /CREDIT_EVIDENCE_UNKNOWN_OR_STALE/);
  const missing = fixtureStore({ failRead: () => true });
  await assert.rejects(guardedEditorialGeneration({ ...request(missing.store), provider }), /STORE_READ_REFUSED/);
  const corrupt = fixtureStore({state:{...seed(),entries:[{}]}});
  await assert.rejects(guardedEditorialGeneration({ ...request(corrupt.store), provider }), /CORRUPT/);
  assert.equal(calls, 0); assert.equal(f.writes.length, 0);
});
test('Contents CAS race allows only one provider request and preserves numeric usage', async () => {
  let arrivals = 0, release;
  const barrier = new Promise(r => { release = r; });
  const f = fixtureStore({ beforeWrite: async body => {
    const state = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    if (state.entries[0].status === 'reserved') { arrivals++; if (arrivals === 2) release(); await barrier; }
  } });
  let calls = 0; const provider = async () => { calls++; return response(); };
  const results = await Promise.allSettled([guardedEditorialGeneration({...request(f.store),provider}), guardedEditorialGeneration({...request(f.store),provider})]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(calls, 1); assert.equal(f.state.entries.length, 1);
  assert.equal(f.state.entries[0].status, 'completed');
  assert.equal(f.state.entries[0].actualInputTokens, 20_000);
  assert.equal(f.state.entries[0].reserveUsd, 0.07);
  assert.ok(!JSON.stringify(f.state).includes(input));
  await assert.rejects(guardedEditorialGeneration({...request(f.store),provider}), /ALREADY_JOURNALED/);
  assert.equal(calls, 1);
});
test('unknown provider result retains reservation and blocks batch replay or new attempt', async () => {
  const f = fixtureStore(); let calls = 0;
  const provider = async () => { calls++; throw new Error('private provider response'); };
  await assert.rejects(guardedEditorialGeneration({...request(f.store),provider}), /GUARDED_PROVIDER_OUTCOME_UNKNOWN/);
  assert.equal(f.state.entries[0].status, 'unknown');
  assert.equal(f.state.entries[0].reserveUsd, 0.07);
  await assert.rejects(guardedEditorialGeneration({...request(f.store),provider}), /ALREADY_JOURNALED/);
  await assert.rejects(guardedEditorialGeneration({...request(f.store),attempt:2,provider}), /BATCH_HAS_UNCERTAIN/);
  assert.equal(calls, 1); assert.ok(!JSON.stringify(f.state).includes('private provider response'));
});
test('lost completion CAS holds reservation and never repeats irreversible call', async () => {
  const f = fixtureStore({failWrite: number => number === 2}); let calls = 0;
  const provider = async () => { calls++; return response(); };
  await assert.rejects(guardedEditorialGeneration({...request(f.store),provider}), /COMPLETION_UNCERTAIN/);
  assert.equal(f.state.entries[0].status, 'reserved');
  await assert.rejects(guardedEditorialGeneration({...request(f.store),provider}), /ALREADY_JOURNALED/);
  assert.equal(calls, 1);
});
test('reservation CAS or confirmation failure makes zero irreversible calls and retains uncertainty', async () => {
  let calls = 0; const provider = async () => {calls++;return response();};
  const failed = fixtureStore({failWrite:()=>true});
  await assert.rejects(guardedEditorialGeneration({...request(failed.store),provider}), /BUDGET_CAS_REFUSED/);
  const unconfirmed = fixtureStore({failRead:number=>number===2});
  await assert.rejects(guardedEditorialGeneration({...request(unconfirmed.store),provider}), /STORE_READ_REFUSED/);
  assert.equal(unconfirmed.state.entries[0].status,'reserved');
  await assert.rejects(guardedEditorialGeneration({...request(unconfirmed.store),provider}), /ALREADY_JOURNALED/);
  assert.equal(calls,0);
});
test('batch/day token, request, dollar and persistent credit caps deny before provider', async () => {
  const f = fixtureStore(); const provider = async () => response();
  await guardedEditorialGeneration({...request(f.store),provider});
  for (const [patch, expected] of [
    [{limits:{...limits,batchRequests:1}}, /BATCH_TOKEN_OR_REQUEST_LIMIT/],
    [{limits:{...limits,batchOutputTokens:20_000}}, /BATCH_TOKEN_OR_REQUEST_LIMIT/],
    [{limits:{...limits,dailyRequests:1}}, /DAILY_TOKEN_OR_REQUEST_LIMIT/],
    [{limits:{...limits,dailyTokens:50_000}}, /DAILY_TOKEN_OR_REQUEST_LIMIT/],
    [{limits:{...limits,batchUsd:0.1}}, /DOLLAR_OR_CREDIT_LIMIT/],
    [{limits:{...limits,dailyUsd:0.1}}, /DOLLAR_OR_CREDIT_LIMIT/]
  ]) await assert.rejects(guardedEditorialGeneration({...request(f.store),attempt:2,...patch,provider}), expected);
  assert.equal(f.state.entries.length, 1);
  const low = fixtureStore({state:{...seed(),creditProof:{...seed().creditProof,availableUsd:0.1}}});
  await guardedEditorialGeneration({...request(low.store),provider});
  await assert.rejects(guardedEditorialGeneration({...request(low.store),batchId:'other-batch',provider}), /DOLLAR_OR_CREDIT_LIMIT/);
});
test('unverifiable usage or bound overrun stays unknown; overrun blocks all further spend', async () => {
  const f = fixtureStore();
  await assert.rejects(guardedEditorialGeneration({...request(f.store),provider: async () => ({...response(),usage:{input_tokens:30001,output_tokens:1}})}), /USAGE_UNKNOWN_OR_BOUND_EXCEEDED/);
  assert.equal(f.state.entries[0].status, 'unknown');
  await assert.rejects(reserveEditorialRequest({...request(f.store),batchId:'other-batch'}), /TOKEN_BOUND_BREACH/);
});
test('unknown reservation holds credit across midnight and refreshed proof, never refunds on UTC rollover', async () => {
  const f = fixtureStore();
  await assert.rejects(guardedEditorialGeneration({...request(f.store),provider:async()=>{throw new Error('timeout');}}), /OUTCOME_UNKNOWN/);
  const state = f.state;
  state.entries[0].reservedAt = '2026-11-11T23:59:00.000Z';
  state.creditProof.availableUsd = 0.1;
  const nextDay = fixtureStore({state});
  await assert.rejects(guardedEditorialGeneration({...request(nextDay.store),batchId:'next-day-batch',provider:async()=>response()}), /DOLLAR_OR_CREDIT_LIMIT/);
  assert.equal(nextDay.state.entries[0].reserveUsd, 0.07);
  assert.equal(nextDay.writes.length, 0);
});
test('real overlap is blocked after charged generation, before downstream publication', async () => {
  const read = slug => fs.readFile(`ops/editorial/content-artifacts/${slug}.json`, 'utf8').then(JSON.parse);
  const a = await read('adult-games-age-check-data-review-before-browsing');
  const b = await read('adult-shop-age-check-data-transparency-review');
  const f = fixtureStore();
  const generated = await guardedEditorialGeneration({...request(f.store),expectedCount:2,provider:async()=>response([a,b])});
  const preflight = await preflightReviewedEditorialBatch({enabled:true,candidates:generated.candidates,corpus:[],corpusCommit:'a'.repeat(40),now});
  assert.equal(preflight.state, 'NOVELTY_OVERLAP_BLOCKED');
  assert.equal(preflight.publicationAuthorized, false);
  assert.equal(f.state.entries[0].status, 'completed');
});
test('review receipt binds exact candidate, corpus commit/content and batch; authority remains separate', async () => {
  const corpus = [{slug:'billing',backlogId:'billing',title:'Refund and renewal billing',keyTakeaways:['Payment refund cancellation.'],sections:[]}];
  const options = {candidate,corpus,corpusCommit:'a'.repeat(40),batch:[candidate],now};
  const receipt = createNoveltyReview({...options,reviewer:'fixture-reviewer',reviewedAt:now});
  assert.equal(verifyNoveltyReview({...options,receipt}).allowed, true);
  for (const patch of [{candidate:{...candidate,title:'Changed draft'}},{corpusCommit:'b'.repeat(40)},{corpus:[...corpus,{slug:'new',title:'New evidence'}]},{batch:[candidate,{slug:'other',title:'Other draft'}]}]) assert.equal(verifyNoveltyReview({...options,...patch,receipt}).reason, 'NOVELTY_REVIEW_STALE_BINDING');
  assert.equal(verifyNoveltyReview({...options,receipt,now:now+3_600_001}).allowed, false);
  const preflight = {...options,enabled:true,candidates:[candidate],receipts:[receipt]};
  assert.equal((await preflightReviewedEditorialBatch(preflight)).state, 'NOVELTY_REVIEW_PROVENANCE_UNVERIFIED');
  assert.equal((await preflightReviewedEditorialBatch({...preflight,verifyReviewProvenance:async()=>true})).state, 'READY_FOR_EXISTING_QUALITY_GATES');
  assert.equal((await preflightReviewedEditorialBatch({...preflight,verifyReviewProvenance:async()=>true})).publicationAuthorized, false);
});
test('offline executable preflight defaults to pause without reading input files', async () => {
  let reads=0;
  assert.equal((await reviewedPreflightCommand([],async()=>{reads++;throw new Error();})).state,'PAUSED_BY_DEFAULT');
  assert.equal(reads,0);
});
