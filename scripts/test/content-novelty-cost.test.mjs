import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { profile, compareNovelty, gateCandidate } from '../content-novelty-audit.mjs';
import { accountRequests, assessBudget } from '../editorial-cost-budget.mjs';
test('real cross-category age-check incident requires review from tasks and core points', async () => {
  const read = slug => fs.readFile(`ops/editorial/content-artifacts/${slug}.json`, 'utf8').then(JSON.parse);
  const a = await read('adult-games-age-check-data-review-before-browsing');
  const b = await read('adult-shop-age-check-data-transparency-review');
  const comparison = compareNovelty(profile(a), profile(b));
  assert.equal(comparison.decision, 'REVIEW_OVERLAP', JSON.stringify(comparison));
  assert.ok(comparison.sharedIntentConcepts.includes('age_evidence'));
  assert.equal(gateCandidate(a, [b]).decision, 'REVIEW_REQUIRED');
});
test('shared template or audience alone does not reject a distinct reader task', () => {
  const a = { slug: 'a', categorySlug: 'games', title: 'Account password recovery', keyTakeaways: ['Recover your account with a password reset.'], sections: [{ heading: 'Checklist', paragraphs: ['Review recovery email access.'] }] };
  const b = { slug: 'b', categorySlug: 'games', title: 'Refund and renewal billing', keyTakeaways: ['Review payment refunds and renewal.'], sections: [{ heading: 'Checklist', paragraphs: ['Read checkout cancellation terms.'] }] };
  assert.equal(compareNovelty(profile(a), profile(b)).decision, 'PASS_HEURISTIC');
  assert.equal(gateCandidate(a, [b]).publishAuthorized, false);
});
const requests = [{ runId: '43151510253', attempt: 1, inputTokens: 30352, outputTokens: 11834 }, { runId: '43151510253', attempt: 2, inputTokens: 30388, outputTokens: 10899 }];
test('real recorded usage sums retries; missing price or token evidence remains unknown', () => {
  const actual = accountRequests(requests, { model: 'gpt-6-luna' });
  assert.equal(actual.inputTokens, 60740); assert.equal(actual.outputTokens, 22733);
  assert.equal(actual.totalTokens, 83473); assert.equal(actual.retries, 1);
  assert.equal(actual.estimatedUsd, null); assert.equal(actual.costStatus, 'UNKNOWN');
  assert.equal(accountRequests([{runId:'1', attempt:1, inputTokens:null, outputTokens:2}]).totalTokens, null);
  assert.throws(() => accountRequests([...requests, requests[0]]), /DUPLICATE/);
});
const now = Date.parse('2026-11-12T00:00:00Z');
// Deliberately synthetic fixture prices; never production model-price evidence.
const config = { version:1, models:{ fixture:{verified:true, sourceUrl:'https://openai.com/api/pricing/', verifiedAt:'2026-11-11T00:00:00Z', expiresAt:'2026-11-13T00:00:00Z', inputUsdPerMillion:1, outputUsdPerMillion:2} } };
const base = { config, model:'fixture', now, limits:{batchRequests:3,batchOutputTokens:60000,dailyRequests:72,dailyTokens:1000000,batchUsd:1,dailyUsd:10}, spent:{dayUtc:'2026-11-12',creditVerifiedAt:'2026-11-12T00:00:00Z',batchRequests:0,batchOutputTokens:0,dailyRequests:0,dailyTokens:0,batchUsd:0,dailyUsd:0,availableCreditUsd:1},reservation:{requests:1,inputTokens:30000,outputTokens:20000} };
test('offline budget denies missing price, stale prices, unknown balances and overflow before spend', () => {
  assert.equal(assessBudget({...base,model:'gpt-6-luna'}).reason, 'VERIFIED_PRICE_UNKNOWN');
  assert.equal(assessBudget({...base,now:Date.parse('2027-01-01')}).allowed, false);
  assert.equal(assessBudget({...base,spent:{...base.spent,availableCreditUsd:null}}).allowed, false);
  assert.equal(assessBudget({...base,spent:{...base.spent,dayUtc:'2026-11-11'}}).reason, 'DAILY_WINDOW_UNKNOWN_OR_STALE');
  assert.equal(assessBudget({...base,spent:{...base.spent,creditVerifiedAt:'2026-11-11T00:00:00Z'}}).reason, 'CREDIT_EVIDENCE_UNKNOWN_OR_STALE');
  assert.equal(assessBudget({...base,reservation:{...base.reservation,requests:4}}).reason, 'BATCH_TOKEN_OR_REQUEST_LIMIT');
  assert.equal(assessBudget({...base,spent:{...base.spent,dailyTokens:999999}}).reason, 'DAILY_TOKEN_OR_REQUEST_LIMIT');
  assert.equal(assessBudget(base).allowed, true);
  assert.equal(assessBudget(base).reserveUsd, 0.07);
});
