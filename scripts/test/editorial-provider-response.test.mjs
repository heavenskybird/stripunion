import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialResponse } from '../editorial-provider-response.mjs';

for (const [status, error, expected] of [
  [429, { code: 'credit_balance_exhausted' }, 'PROVIDER_QUOTA_EXHAUSTED'],
  [429, { type: 'insufficient_quota' }, 'PROVIDER_QUOTA_EXHAUSTED'],
  [429, { code: 'rate_limit_exceeded' }, 'PROVIDER_RATE_LIMITED'],
  [401, {}, 'PROVIDER_AUTHENTICATION_FAILED'],
  [403, {}, 'PROVIDER_ACCESS_DENIED'],
  [503, {}, 'PROVIDER_REQUEST_FAILED']
]) {
  test(`provider ${status}/${error.code || error.type || 'unknown'} fails once with safe classification`, async () => {
    const response = new Response(JSON.stringify({ error: { ...error, message: 'secret-and-private-request' } }), { status });
    await assert.rejects(editorialResponse(response), (failure) => {
      assert.match(failure.message, new RegExp(expected));
      assert.ok(!failure.message.includes('secret-and-private-request'));
      return true;
    });
  });
}
test('non-JSON provider error remains safely classified', async () => {
  await assert.rejects(editorialResponse(new Response('private html', { status: 502 })), /PROVIDER_REQUEST_FAILED http=502/);
});
test('successful response remains unchanged', async () => {
  assert.deepEqual(await editorialResponse(Response.json({ output: [] })), { output: [] });
});
