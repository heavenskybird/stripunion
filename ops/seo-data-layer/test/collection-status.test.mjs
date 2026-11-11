import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectionStatus } from '../src/reports/collection-status.mjs';

test('partial source failure preserves other current sources and never accepts old snapshots as current', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seo-status-'));
  try {
    const env = { GITHUB_RUN_ID: '123', COLLECTION_STARTED_AT: '2026-11-11T01:00:00Z', CLARITY_CONFIGURED: 'true', BING_ACCEPTANCE_OUTCOME: 'success', BLOG_HEALTH_OUTCOME: 'success' };
    await fs.mkdir(path.join(root, '2026-11-09'));
    for (const [name, key] of [['gsc','GSC'],['gsc-blog','GSC_BLOG'],['ga4','GA4'],['ga4-admin','GA4_ADMIN'],['clarity','CLARITY'],['bing','BING'],['buffer','BUFFER'],['stripcash','STRIPCASH'],['attribution','ATTRIBUTION']]) {
      env[`${key}_OUTCOME`] = 'success';
      await fs.writeFile(path.join(root, '2026-11-09', `${name}.json`), JSON.stringify({ collectedAt: '2026-11-11T01:01:00Z', endDate: '2026-11-09' }));
    }
    const now = Date.parse('2026-11-11T01:05:00Z');
    assert.equal((await collectionStatus(root, env, now)).status, 'healthy');
    env.BUFFER_OUTCOME = 'failure';
    const partial = await collectionStatus(root, env, now);
    assert.equal(partial.status, 'degraded');
    assert.equal(partial.sources.buffer.status, 'failed');
    assert.equal(partial.sources.gsc.status, 'ok');
    assert.equal(partial.sources.gsc.endDate, '2026-11-09');
    await fs.writeFile(path.join(root, '2026-11-09', 'ga4.json'), JSON.stringify({ collectedAt: '2026-11-10T01:00:00Z' }));
    const stale = await collectionStatus(root, env, now);
    assert.equal(stale.status, 'failed');
    assert.equal(stale.sources.ga4.status, 'missing_current_snapshot');
    await fs.writeFile(path.join(root, '2026-11-09', 'ga4.json'), JSON.stringify({ collectedAt: '2026-11-12T01:00:00Z' }));
    assert.equal((await collectionStatus(root, env, now)).sources.ga4.currentRunSnapshot, false);
    await fs.writeFile(path.join(root, '2026-11-09', 'ga4.json'), '{broken');
    assert.equal((await collectionStatus(root, env, now)).sources.ga4.corruptSnapshotObserved, true);
    assert.ok(JSON.parse(await fs.readFile(path.join(root, '2026-11-09', 'gsc.json'))).collectedAt);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
