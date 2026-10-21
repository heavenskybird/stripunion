import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSearchOpportunityGsc } from '../../growth/gsc-scope.mjs';

test('Blog URL-prefix Search Console data is used when Domain property is unavailable', () => {
  const blog = { date: '2026-10-19', data: { queryRows: [{ query: 'adult toy packaging', impressions: 63 }] } };
  const result = selectSearchOpportunityGsc(null, blog);
  assert.equal(result.snapshot, blog);
  assert.equal(result.sourceName, 'GSC-Blog');
});
test('Domain data takes precedence and prevents double counting with Blog', () => {
  const domain = { date:'2026-10-19', data: { queryRows:[] } };
  const blog = { date:'2026-10-19', data: { queryRows:[] } };
  const result = selectSearchOpportunityGsc(domain, blog);
  assert.equal(result.snapshot, domain);
  assert.equal(result.scope, 'domain');
});
