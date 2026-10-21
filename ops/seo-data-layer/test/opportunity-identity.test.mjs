import test from 'node:test';
import assert from 'node:assert/strict';
import { opportunityId } from '../../growth/opportunity-identity.mjs';

test('different long-prefix Bing opportunities get distinct stable IDs', () => {
  const a = opportunityId('Bing', 'adult toy retailer discreet billing shipping faq packaging');
  const b = opportunityId('Bing', 'adult toy retailer discreet packaging billing privacy buying online');
  assert.notEqual(a, b);
  assert.equal(a, opportunityId('Bing', 'adult toy retailer discreet billing shipping faq packaging'));
  assert.match(a, /^bing-[0-9a-f]{32}$/);
});

test('source is part of the identity and empty keys are rejected', () => {
  assert.notEqual(opportunityId('GSC', 'query'), opportunityId('Bing', 'query'));
  assert.throws(() => opportunityId('Bing', ' '), /required/);
});
