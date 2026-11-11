import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DEFAULT_GA4_MEASUREMENT_ID, resolveGa4MeasurementId } from '../../src/config/analytics.mjs';
test('missing Hostinger variable uses the existing canonical stream, explicit configuration wins', async () => {
  const snapshot = JSON.parse(await fs.readFile(new URL('../../ops/seo-data-layer/data/raw/2026-11-11/ga4-admin.json', import.meta.url)));
  assert.ok(snapshot.streams.some(s => s.defaultUri === 'https://stripunion.com' && s.measurementId === DEFAULT_GA4_MEASUREMENT_ID));
  assert.equal(resolveGa4MeasurementId(undefined), DEFAULT_GA4_MEASUREMENT_ID);
  assert.equal(resolveGa4MeasurementId('  G-TEST123456  '), 'G-TEST123456');
  assert.throws(() => resolveGa4MeasurementId('invalid-public-id'), /Invalid/);
});
