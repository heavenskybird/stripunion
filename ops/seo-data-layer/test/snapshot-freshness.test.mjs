import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSnapshot } from '../../growth/snapshot-freshness.mjs';

const now = Date.parse('2026-10-21T13:15:00.000Z');
test('stale GSC Domain snapshot is treated as unavailable, not zero traffic', () => {
  assert.equal(freshSnapshot({data:{collectedAt:'2026-10-13T07:48:20.184Z', dailyRows:[]}},now),null);
  assert.ok(freshSnapshot({data:{collectedAt:'2026-10-21T13:10:00.000Z', dailyRows:[]}},now));
});
test('unknown timestamps and future snapshots fail closed', () => {
  assert.equal(freshSnapshot({data:{collectedAt:'invalid'}},now),null);
  assert.equal(freshSnapshot({data:{collectedAt:'2026-10-22T00:00:00.000Z'}},now),null);
  assert.equal(freshSnapshot({data:{}},now),null);
});
