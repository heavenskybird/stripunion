import test from 'node:test';
import assert from 'node:assert/strict';
import { bingDate, bingCrawlEvidence } from '../src/lib/bing-crawl-evidence.mjs';
test('Bing aggregate errors retain provider date and empty details are not recovery', () => {
  const result = bingCrawlEvidence({ site: 'https://stripunion.com', methodStatus: { GetCrawlIssues: 'ok' }, crawlIssues: [], crawlStats: [
    { Date: '/Date(1793923200000)/', CrawlErrors: 2 },
    { Date: '/Date(1794009600000)/', CrawlErrors: 5, InIndex: 44, Code4xx: 0 }
  ] }, '2026-11-13T08:08:38Z', '2026-11-13T13:00:00Z');
  assert.equal(result.providerDataAsOf, '2026-11-07T00:00:00.000Z');
  assert.equal(result.ageDays, 6);
  assert.equal(result.aggregateCrawlErrors, 5);
  assert.equal(result.issueUrls, 0);
  assert.equal(result.issueDetailStatus, 'NO_URL_DETAILS_RETURNED');
});
test('missing API evidence and invalid dates remain unknown', () => {
  assert.equal(bingDate('/Date(nope)/'), null);
  const result = bingCrawlEvidence({ crawlStats: [{ Date: 'invalid', CrawlErrors: 99 }], crawlIssues: [] });
  assert.equal(result.providerDataAsOf, null);
  assert.equal(result.aggregateCrawlErrors, null);
  assert.equal(result.issueUrls, null);
  assert.equal(result.issueDetailStatus, 'UNKNOWN');
});

test('a date without metric fields cannot turn unavailable metrics into zero', () => {
  const result = bingCrawlEvidence({ crawlStats: [{ Date: '2026-11-07' }] });
  assert.equal(result.aggregateCrawlErrors, null);
  assert.equal(result.indexedPages, null);
  assert.equal(result.http4xx, null);
});
