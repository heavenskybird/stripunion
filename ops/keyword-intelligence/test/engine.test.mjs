import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptGsc, adaptBing, canonicalGscRecords, deduplicate, normalizeKeyword, scoreOpportunity } from '../engine.mjs';

// Synthetic, sanitized contract fixtures. Never production SEO claims.
const snapshot = { source: 'google-search-console', siteUrl: 'sc-domain:stripunion.com',
  collectedAt: '2026-10-24T00:00:00Z', queryPageRows: [
    { date: '2026-10-22', query: 'Example Review', page: 'https://stripunion.com/example/', clicks: 0, impressions: 10, position: 8 },
  ] };
test('Unicode normalization retains meaning, accents and non-Latin scripts', () => {
  assert.equal(normalizeKeyword(' ＣＡＭ\tReview  '), 'cam review');
  assert.equal(normalizeKeyword('安全 支付'), '安全 支付');
  assert.notEqual(normalizeKeyword('café'), normalizeKeyword('cafe'));
  assert.notEqual(normalizeKeyword('a+b'), normalizeKeyword('a b'));
});
test('GSC preserves measured zero, unknown volume and average-rank limitation', () => {
  const [r] = adaptGsc(snapshot);
  assert.equal(r.clicks, 0); assert.equal(r.ctr, 0);
  assert.equal(r.estimated_monthly_search_volume, null);
  assert.equal(r.country, null); assert.equal(r.source_updated_at, null);
  assert.match(r.evidence[0].limitations[0], /average/);
});
test('missing numeric values never become measured zero', () => {
  const [r] = adaptGsc({ ...snapshot, queryPageRows: [{ date: '2026-10-22', query: 'Missing' }] });
  assert.equal(r.clicks, null); assert.equal(r.ctr, null); assert.equal(r.our_rank, null);
});
test('Domain and Blog never double-count; AVCams remains separate', () => {
  const blog = { ...snapshot, siteUrl: 'https://blog.stripunion.com/' };
  const av = { ...snapshot, siteUrl: 'sc-domain:avcams.online' };
  assert.equal(canonicalGscRecords(snapshot, blog).length, 1);
  assert.equal(canonicalGscRecords(null, blog)[0].property, blog.siteUrl);
  assert.equal(canonicalGscRecords(snapshot, blog, av).length, 2);
  assert.throws(() => adaptGsc({ ...snapshot, siteUrl: 'unexpected' }));
});
test('overlapping collections replace same observation, dates/pages remain distinct', () => {
  const [a] = adaptGsc(snapshot), b = structuredClone(a);
  b.observed_at = '2026-10-25T00:00:00Z'; b.impressions = 12;
  assert.equal(deduplicate([a, b, a])[0].impressions, 12);
  const c = structuredClone(a); c.our_ranking_url += 'second';
  assert.equal(deduplicate([a, c]).length, 2);
  const d = structuredClone(a); d.evidence[0].period.start = '2026-10-21';
  assert.equal(deduplicate([a, d]).length, 2);
  assert.deepEqual(deduplicate([a, b]), deduplicate([b, a]));
  const conflict = { ...a, impressions: 100 };
  assert.throws(() => deduplicate([a, conflict]), /Conflicting/);
});
test('Bing query evidence cannot manufacture a page join or monthly volume', () => {
  const [r] = adaptBing({ source: 'bing', collectedAt: snapshot.collectedAt, sites: [
    { siteUrl: 'https://stripunion.com/', methodStatus: { GetQueryStats: 'ok' }, queryStats: [
      { Query: 'Example Review', Date: '/Date(0)/', Impressions: 3, Clicks: 1, AvgImpressionPosition: -1 },
    ] }, { methodStatus: { GetQueryStats: 'error' }, queryStats: [{ Query: 'Ignore' }] },
  ] });
  assert.equal(r.our_ranking_url, null); assert.equal(r.our_rank, null);
  assert.equal(r.estimated_monthly_search_volume, null);
  assert.equal(r.evidence[0].period.start, '1970-01-01');
});
test('scores explain missing coverage and penalize confidence/freshness', () => {
  assert.equal(scoreOpportunity({}).score, null);
  const a = scoreOpportunity({ ranking: 1 }, { confidence: 1, freshness: 1 });
  assert.equal(a.score, 20); assert.equal(a.coverage, .2);
  assert.equal(a.contributions.demand.value, null);
  assert.equal(scoreOpportunity({ ranking: 1 }, { confidence: .5, freshness: .5 }).score, 5);
  assert.equal(scoreOpportunity({ ranking: 1 }, { confidence: 1, freshness: 0 }).score, 0);
  assert.throws(() => scoreOpportunity({ ranking: 2 }));
  assert.throws(() => scoreOpportunity({}, { weights: { unknown: 1 } }));
  assert.throws(() => scoreOpportunity({}, { weights: { demand: 0 } }));
});
