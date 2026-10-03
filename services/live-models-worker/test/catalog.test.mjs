import test from 'node:test';
import assert from 'node:assert/strict';
import { isModelAllowed, prepareCatalog } from '../src/index.js';

const model = (overrides = {}) => ({
  id: 1,
  username: 'sample_model',
  status: 'public',
  gender: 'female',
  snapshotUrl: 'https://cdn.example.invalid/sample.jpg',
  viewersCount: 100,
  favoritedCount: 10,
  geobans: {
    blockedCountries: [],
    blockedRegions: {},
    blockedLanguages: []
  },
  ...overrides
});

test('filters blocked country', () => {
  assert.equal(
    isModelAllowed(model({ geobans: { blockedCountries: ['sg'], blockedRegions: {}, blockedLanguages: [] } }), {
      country: 'SG', region: '', languages: 'en-US,en;q=0.9'
    }),
    false
  );
});

test('filters blocked region', () => {
  assert.equal(
    isModelAllowed(model({ geobans: { blockedCountries: [], blockedRegions: { us: ['ny'] }, blockedLanguages: [] } }), {
      country: 'US', region: 'NY', languages: 'en-US'
    }),
    false
  );
});

test('filters blocked language', () => {
  assert.equal(
    isModelAllowed(model({ geobans: { blockedCountries: [], blockedRegions: {}, blockedLanguages: ['uk'] } }), {
      country: 'GB', region: '', languages: 'uk-UA,uk;q=0.9,en;q=0.8'
    }),
    false
  );
});

test('unknown geo hides geographically restricted models', () => {
  assert.equal(
    isModelAllowed(model({ geobans: { blockedCountries: ['ua'], blockedRegions: {}, blockedLanguages: [] } }), {
      country: '', region: '', languages: 'en'
    }),
    false
  );
});

test('catalog keeps only public models and sorts by viewers', () => {
  const result = prepareCatalog({
    models: [
      model({ id: 2, username: 'low', viewersCount: 2 }),
      model({ id: 3, username: 'private', status: 'private', viewersCount: 999 }),
      model({ id: 4, username: 'high', viewersCount: 50 })
    ]
  });
  assert.deepEqual(result.map((item) => item.username), ['high', 'low']);
  assert.equal(result[0].snapshotUrl, 'https://cdn.example.invalid/sample.jpg');
});
