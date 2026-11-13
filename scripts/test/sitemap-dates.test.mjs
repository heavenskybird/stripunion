import test from 'node:test';
import assert from 'node:assert/strict';
import { contentLastmod } from '../sitemap-dates.mjs';
test('lastmod uses content evidence, rejects invalid/future dates and never uses build clock', () => {
 const now = new Date('2026-11-13T00:00:00Z');
 assert.equal(contentLastmod({updatedAt:'2026-11-12',publishedAt:'2026-11-01'},now),'2026-11-12');
 assert.equal(contentLastmod({updatedAt:'2026-11-31',publishedAt:'2026-11-01'},now),'2026-11-01');
 assert.equal(contentLastmod({updatedAt:'2027-01-01'},now),null);
 assert.equal(contentLastmod({},now),null);
});
