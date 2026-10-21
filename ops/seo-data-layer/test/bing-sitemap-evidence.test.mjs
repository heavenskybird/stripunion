import test from 'node:test';
import assert from 'node:assert/strict';
import { recentSuccessfulBingSitemap } from '../src/lib/bing-sitemap-evidence.mjs';

const now = Date.parse('2026-10-21T13:40:00.000Z');
const feed = (url, ageDays, overrides = {}) => ({
  Url:url, Status:'Success', UrlCount:687,
  LastCrawled:`/Date(${now - ageDays * 86400000})/`, ...overrides
});
test('recent Bing crawl is qualified secondary evidence for same-site sitemap', () => {
  const evidence = recentSuccessfulBingSitemap([feed('https://stripunion.com/sitemap.xml',3)],'https://stripunion.com/',now);
  assert.equal(evidence.urlCount,687);
  assert.equal(evidence.url,'https://stripunion.com/sitemap.xml');
});
test('rejects old, failed, unpopulated or wrong-host sitemap evidence', () => {
  for (const f of [
    feed('https://stripunion.com/sitemap.xml',8),
    feed('https://stripunion.com/sitemap.xml',1,{Status:'Error'}),
    feed('https://stripunion.com/sitemap.xml',1,{UrlCount:0}),
    feed('https://blog.stripunion.com/sitemap_index.xml',1),
    feed('https://stripunion.com/sitemap.xml',1,{LastCrawled:''})
  ]) assert.equal(recentSuccessfulBingSitemap([f],'https://stripunion.com/',now),null);
});
