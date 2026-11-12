import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveBufferRequest, budgetedBufferFetch, bufferFetch } from '../buffer-request-budget.mjs';
const now = Date.parse('2026-11-11T10:00:00Z');
const store = () => ({ state: null, async write(value) { this.state = value; } });

test('monthly provider 429 persists cooldown across clients without making another request', async () => {
  const db = store(); let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({ errors: [{ extensions: { code: 'RATE_LIMIT_EXCEEDED', window: '30d' } }] }, { status: 429 }); };
  await budgetedBufferFetch('https://api.buffer.com', {}, { store: db, fetchImpl, now: () => now });
  assert.equal(db.state.used, 1);
  assert.equal(db.state.blockedUntil, now + 30 * 86_400_000);
  await assert.rejects(budgetedBufferFetch('https://api.buffer.com', {}, { store: db, fetchImpl, now: () => now + 1000 }), /cooldown/);
  assert.equal(calls, 1);
});
test('daily and rolling 30-day local budgets include read and send calls', async () => {
  const db = store();
  await reserveBufferRequest(db, now, { daily: 1, monthly: 2 });
  await assert.rejects(reserveBufferRequest(db, now, { daily: 1, monthly: 2 }), /ceiling/);
  await reserveBufferRequest(db, now + 86_400_000, { daily: 1, monthly: 2 });
  await assert.rejects(reserveBufferRequest(db, now + 2 * 86_400_000, { daily: 1, monthly: 2 }), /ceiling/);
  await reserveBufferRequest(db, now + 30 * 86_400_000, { daily: 1, monthly: 2 });
  assert.equal(db.state.used, 1);
});
test('CAS failure refuses provider calls and corrupt state refuses resetting the budget', async () => {
  let calls = 0;
  await assert.rejects(budgetedBufferFetch('https://api.buffer.com', {}, { store: { state: null, write: async () => { throw Error('409'); } }, fetchImpl: async () => { calls++; }, now: () => now }));
  assert.equal(calls, 0);
  await assert.rejects(reserveBufferRequest({ state: { used: -1 }, write: async () => {} }, now), /Invalid/);
});
test('GraphQL HTTP200 quota error is also a cooldown, not a successful request', async () => {
  const db = store();
  await budgetedBufferFetch('https://api.buffer.com', {}, { store: db, fetchImpl: async () => Response.json({ errors: [{ extensions: { code: 'RATE_LIMIT_EXCEEDED', window: '30d' } }] }), now: () => now });
  assert.equal(db.state.blockedUntil, now + 30 * 86_400_000);
});

test('unprovisioned runtime cannot fall back to unbudgeted provider requests', () => {
  const previous = process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED;
  const before = globalThis.fetch; let calls = 0;
  delete process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED;
  globalThis.fetch = () => { calls++; };
  try { assert.throws(() => bufferFetch('https://api.buffer.com', {}), /BUFFER_RUNTIME_NOT_ACCEPTED/); assert.equal(calls, 0); }
  finally { globalThis.fetch = before; if (previous === undefined) delete process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED; else process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED = previous; }
});
