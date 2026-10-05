import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAttributionClick,
  normalizeExperimentExposure,
  normalizeMemberId,
  normalizePostback
} from '../src/index.js';

test('validates StripUnion member IDs', () => {
  assert.equal(normalizeMemberId('su_12345678'), 'su_12345678');
  assert.equal(normalizeMemberId('not-valid'), null);
});

test('normalizes first-party click attribution', () => {
  const click = normalizeAttributionClick({
    memberId: 'su_1234567890',
    pagePath: '/best-live-cam-sites',
    affiliateSource: 'best_live_cam_sites_live_now',
    acquisitionSource: 'bing',
    campaignId: 'su_live_now',
    creativeId: 'live_model_card',
    sourceId: 'stripunion',
    p1: 'best_live_cam_sites',
    p2: 'model_123',
    p3: 'bing',
    experimentId: 'cta-copy-test',
    experimentVariant: 'treatment',
    targetDomain: 'avcams.online',
    destinationPath: '/search/magic-search/example'
  });

  assert.equal(click.memberId, 'su_1234567890');
  assert.equal(click.p1, 'best_live_cam_sites');
  assert.equal(click.experimentId, 'cta-copy-test');
  assert.equal(click.experimentVariant, 'treatment');
  assert.equal(click.targetDomain, 'avcams.online');
});

test('normalizes postback aliases and event types without retaining PII', () => {
  const postback = normalizePostback({
    member_id: 'su_abcdefgh1234',
    conversionType: 'First Purchase',
    commission: '$12.50',
    currencyCode: 'usd',
    transaction_id: 'tx-123',
    email: 'should-not-be-retained@example.invalid'
  });

  assert.equal(postback.memberId, 'su_abcdefgh1234');
  assert.equal(postback.eventType, 'first_purchase');
  assert.equal(postback.revenue, 12.5);
  assert.equal(postback.currency, 'USD');
  assert.equal(postback.transactionId, 'tx-123');
  assert.equal('email' in postback, false);
});

test('normalizes registration and rebill labels', () => {
  assert.equal(normalizePostback({ event: 'Member registration' }).eventType, 'member_registration');
  assert.equal(normalizePostback({ type: 'Rebill' }).eventType, 'rebill');
});


test('normalizes model registration separately from member registration', () => {
  assert.equal(normalizePostback({ type: 'Model registration' }).eventType, 'model_registration');
  assert.equal(normalizePostback({ type: 'Member registration' }).eventType, 'member_registration');
});

test('normalizes positive refund amount to negative revenue', () => {
  const postback = normalizePostback({
    memberId: 'su_refund123456',
    type: 'Refund',
    revenue: '8.25',
    transactionId: 'refund-1'
  });
  assert.equal(postback.eventType, 'refund');
  assert.equal(postback.revenue, -8.25);
});


test('normalizes experiment exposures without retaining arbitrary fields', () => {
  const exposure = normalizeExperimentExposure({
    experimentId: 'cta-copy-test',
    variant: 'control',
    exposureId: 'exp_session_123',
    pagePath: '/best-live-cam-sites',
    affiliateSource: 'hero',
    email: 'should-not-be-retained@example.invalid'
  });

  assert.equal(exposure.experimentId, 'cta-copy-test');
  assert.equal(exposure.variant, 'control');
  assert.equal(exposure.exposureId, 'exp_session_123');
  assert.equal('email' in exposure, false);
});
