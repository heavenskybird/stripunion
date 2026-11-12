import test from 'node:test';
import assert from 'node:assert/strict';
import { AttributionStore } from '../src/index.js';
function fixture() {
  const data = new Map();
  const storage = {
    async get(key) { return structuredClone(data.get(key)); },
    async put(key, value) { for (const [k, v] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) data.set(k, structuredClone(v)); },
    async getAlarm() { return null; }, async setAlarm() {}
  };
  return { store: new AttributionStore({ storage }), storage };
}
test('retried click preserves original attribution and does not move later postback to a different bucket', async () => {
  const { store, storage } = fixture();
  await store.recordClick({ memberId: 'su_original1234', p1: 'first', affiliateSource: 'original' });
  const retry = await store.recordClick({ memberId: 'su_original1234', p1: 'changed', affiliateSource: 'other' });
  assert.equal(retry.duplicate, true);
  await store.recordPostback({ memberId: 'su_original1234', type: 'purchase', transactionId: 'tx-1', revenue: 10, currency: 'USD' });
  const summary = await storage.get('summary');
  assert.equal(summary.totalClicks, 1);
  assert.equal(summary.byP1.first.postbacks, 1);
  assert.equal(summary.byP1.changed, undefined);
  assert.equal(summary.revenueByCurrency.USD, 10);
});
test('missing, invalid and unknown click identities get separate diagnostics, without duplicate revenue', async () => {
  const { store, storage } = fixture();
  for (const [memberId, transactionId] of [[undefined,'missing'],['{memberId}','invalid'],['su_unknown1234','not-found']]) {
    await store.recordPostback({ memberId, type: 'purchase', transactionId, revenue: 2 });
  }
  await store.recordPostback({ type: 'purchase', transactionId: 'missing', revenue: 2 });
  const summary = await storage.get('summary');
  assert.equal(summary.totalPostbacks, 3);
  assert.equal(summary.duplicatePostbacks, 1);
  assert.deepEqual(summary.diagnostics.joinStatus, { missing_member_id: 1, invalid_member_id: 1, click_not_found: 1 });
  assert.equal(summary.diagnostics.unknownCurrency, 3);
  assert.equal(summary.revenueByCurrency.UNKNOWN, 6);
  assert.equal(JSON.stringify(summary).includes('{memberId}'), false);
});
