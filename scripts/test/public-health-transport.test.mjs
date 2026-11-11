import test from 'node:test';
import assert from 'node:assert/strict';
import { request, safeTransportError } from '../public-health-oracle.mjs';
test('health retry releases failed response and keeps bounded status/timing evidence', async () => {
  let calls = 0, cancelled = false;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return { status: 503, body: { async cancel() { cancelled = true; } } };
    assert.equal(cancelled, true);
    return new Response('ok');
  };
  const result = await request('https://stripunion.com', '*/*', { fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.status, 200);
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(result.attempts.map(a => a.status), [503, 200]);
});
test('explicit denial is terminal, transport errors retain safe codes without messages', async () => {
  let calls = 0;
  const result = await request('https://avcams.online', '*/*', { fetchImpl: async () => { calls++; return new Response('denied', { status: 406 }); }, sleepImpl: async () => {} });
  assert.equal(result.status, 406); assert.equal(calls, 1);
  const error = Object.assign(new Error('private host and credential'), { cause: { code: 'ECONNRESET' } });
  assert.deepEqual(safeTransportError(error), { code: 'ECONNRESET', causeCodes: [], attempts: [] });
});
