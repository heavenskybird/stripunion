import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueUpsertRows } from '../../control-plane/client.mjs';

test('duplicate PostgREST conflict keys cannot reach the same SQL upsert statement', () => {
  const input = [
    { opportunity_id: 'collision', rank: 4, target_keyword: 'discreet billing' },
    { opportunity_id: 'collision', rank: 5, target_keyword: 'discreet packaging' },
    { opportunity_id: 'other', rank: 6, target_keyword: 'other topic' }
  ];
  const result = uniqueUpsertRows(input, 'opportunity_id');
  assert.equal(result.duplicates, 1);
  assert.deepEqual(result.rows.map((item) => item.target_keyword), ['discreet billing', 'other topic']);
  assert.equal(input.length, 3, 'canonical evidence must not be altered');
});

test('composite conflict keys deduplicate only identical tuples', () => {
  const rows = [{ a: 'x', b: '1' }, { a: 'x', b: '2' }, { a: 'x', b: '1' }];
  const result = uniqueUpsertRows(rows, 'a,b');
  assert.equal(result.rows.length, 2);
  assert.equal(result.duplicates, 1);
});

test('invalid conflict keys fail closed', () => {
  assert.throws(() => uniqueUpsertRows([{ rank: 1 }], 'opportunity_id'), /Missing upsert conflict key/);
});
