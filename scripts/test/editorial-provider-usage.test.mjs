import test from 'node:test';
import assert from 'node:assert/strict';
import { providerUsage } from '../editorial-provider-usage.mjs';
test('usage records numeric billing evidence without response text or invented costs', () => {
  const record = providerUsage({ attempt: 2, httpStatus: 200, inputCharacters: 120,
    payload: { status: 'completed', output: 'private content', api_key: 'secret',
      usage: { input_tokens: 20, output_tokens: 30, total_tokens: 50 } } });
  assert.equal(record.totalTokens, 50);
  assert.equal(record.attempt, 2);
  assert.equal(record.costUsd, null);
  assert.equal(record.balanceStatus, 'NOT_EXPOSED_TO_PROJECT_KEY');
  assert.ok(!JSON.stringify(record).includes('private content'));
  assert.ok(!JSON.stringify(record).includes('secret'));
  const missing = providerUsage({ attempt: 1, httpStatus: 429,
    payload: { usage: { input_tokens: -1, output_tokens: '30' }, error: { message: 'private' } } });
  assert.equal(missing.inputTokens, null);
  assert.equal(missing.outputTokens, null);
  assert.equal(missing.totalTokens, null);
});
