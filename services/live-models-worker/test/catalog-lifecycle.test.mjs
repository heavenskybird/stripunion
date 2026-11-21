import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelsCatalog, isModelAllowed, prepareCatalog } from '../src/index.js';

const model = { id: 1, username: 'fixture', status: 'public', snapshotUrl: 'https://cdn.example.invalid/preview.jpg', geobans: { blockedCountries: [], blockedRegions: {}, blockedLanguages: [] } };
function fixture(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    async get(keys) { return new Map(keys.filter(k => data.has(k)).map(k => [k, structuredClone(data.get(k))])); },
    async put(key, value) { for (const [k,v] of typeof key === 'string' ? [[key,value]] : Object.entries(key)) data.set(k, structuredClone(v)); },
    async delete(keys) { for (const k of keys) data.delete(k); },
    async deleteAll() { data.clear(); },
    async setAlarm(at) { data.set('alarm', at); }
  };
  return { data, store: new ModelsCatalog({ storage }, { STRIPCASH_MODELS_API_KEY: 'fixture', STRIPCASH_USER_ID: 'fixture' }) };
}
const req = () => new Request('https://catalog.internal/models');
test('catalog failure, cooldown, replacement, single-flight and retention', async t => {
  t.mock.method(Date, 'now', () => 1_000_000);
  let calls = 0;
  let response = () => Response.json({ models: [model] });
  t.mock.method(globalThis, 'fetch', async () => { calls++; return response(); });
  const { data, store } = fixture();
  const results = await Promise.all(Array.from({length: 20}, () => store.fetch(req())));
  assert.equal(calls, 1);
  const fresh = await results[0].json();
  assert.equal(fresh.models.length, 1);
  assert.equal(Date.parse(fresh.validUntil) - Date.parse(fresh.refreshedAt), 90_000);
  assert.equal(results[0].headers.get('cache-control'), 'no-store');
  assert.equal(data.get('alarm'), 1_000_000 + 86_400_000);
  t.mock.method(Date, 'now', () => 1_059_999);
  assert.equal((await store.fetch(req())).status, 200);
  assert.equal(calls, 1, 'requests within 60 seconds reuse the verified catalog');
  t.mock.method(Date, 'now', () => 1_060_000);
  response = () => new Response('', {status: 429});
  assert.equal((await store.fetch(req())).status, 503);
  assert.equal(data.has('catalog'), false);
  assert.equal((await store.fetch(req())).status, 503);
  assert.equal(calls, 2);
  t.mock.method(Date, 'now', () => 1_120_000);
  response = () => Response.json({ models: [] });
  const empty = await (await store.fetch(req())).json();
  assert.deepEqual(empty.models, []);
  await store.alarm();
  assert.equal(data.size, 0);
});
for (const [name, response] of [
  ['network failure', () => { throw new Error('network'); }],
  ['timeout', () => { throw new DOMException('timeout', 'TimeoutError'); }],
  ['invalid JSON', () => new Response('{')],
  ['invalid schema', () => Response.json({ count: 1 })]
]) test(`${name} cannot expose expired catalog`, async t => {
  t.mock.method(globalThis, 'fetch', async () => response());
  const { data, store } = fixture({ catalog: [model], fetchedAt: Date.now() - 60_001 });
  const result = await store.fetch(req());
  assert.equal(result.status, 503);
  assert.equal((await result.json()).models, undefined);
  assert.equal(data.has('catalog'), false);
});
test('expired persisted state is rejected during cooldown and future timestamps are not fresh', async () => {
  const { store } = fixture({ catalog: [model], fetchedAt: Date.now() - 86_400_001, attemptedAt: Date.now() });
  assert.equal((await store.fetch(req())).status, 503);
  const future = fixture({ catalog: [model], fetchedAt: Date.now() + 60_000 });
  assert.equal((await future.store.fetch(req())).status, 503);
});
test('online catalog removes offline/missing models, strips stream and bounds retention', () => {
  const result = prepareCatalog({ models: [ {...model, status: 'offline'}, {...model, id: 2, stream: 'private', clickUrl: 'private'} ] });
  assert.deepEqual(result.map(m => m.id), [2]);
  assert.equal('stream' in result[0], false);
  assert.equal('clickUrl' in result[0], false);
  assert.equal(prepareCatalog({models:Array.from({length:600}, (_,i)=>({...model,id:i+1}))}).length, 500);
});
test('geobans cover case, unknown region/language, primary language and allowed visitor', () => {
  const restricted = { geobans: { blockedCountries: ['SG'], blockedRegions: { US: ['NY'] }, blockedLanguages: ['EN'] } };
  for (const geo of [ {country:'XX',languages:'fr'}, {country:'T1',languages:'fr'}, {country:'sg',languages:'fr'}, {country:'US',languages:'fr'}, {country:'US',region:'ny',languages:'fr'}, {country:'CA',languages:'en-US'}, {country:'CA'}, {country:'CA',languages:'*'} ]) assert.equal(isModelAllowed(restricted,geo),false);
  assert.equal(isModelAllowed(restricted,{country:'US',region:'CA',languages:'fr'}),true);
});
test('missing or malformed restriction metadata cannot become an unrestricted model', () => {
  for (const geobans of [undefined, {}, {blockedCountries: 'US', blockedRegions: {}, blockedLanguages: []}, {blockedCountries: [], blockedRegions: {US: 'NY'}, blockedLanguages: []}]) {
    assert.equal(isModelAllowed({...model,geobans}, {country:'US',languages:'en'}),false);
    assert.deepEqual(prepareCatalog({models:[{...model,geobans}]}),[]);
  }
});
test('requests arriving during refresh join the in-flight fetch without another upstream request', async t => {
  let finish;
  let started;
  const began = new Promise(resolve => started = resolve);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => { calls++; started(); return new Promise(resolve => finish = resolve); });
  const { store } = fixture();
  const first = store.fetch(req());
  await began;
  const second = store.fetch(req());
  finish(Response.json({models:[model]}));
  for (const response of await Promise.all([first,second])) assert.equal(response.status,200);
  assert.equal(calls,1);
});
