import test from 'node:test';
import assert from 'node:assert/strict';
import { minimalRearm } from '../recovery-r1-rearm.mjs';
const fixture = { version: 1, status: 'failure', cycleId: '41254032304', runId: '41260561057', attempts: 3,
  startedAt: '2026-11-01T01:18:58.404Z', finishedAt: '2026-11-01T01:19:24.918Z',
  recentRunIds: [...Array.from({length: 199}, (_, i) => String(i)), '41260561057'] };
test('controlled rearm changes exactly one digit and rejects drift or wrong incident', () => {
  const raw = JSON.stringify(fixture, null, 2) + '\n';
  assert.equal(minimalRearm(raw), raw.replace('"attempts": 3', '"attempts": 1'));
  for (const change of [{ attempts: 1 }, { status: 'success' }, { cycleId: '38850741342' }, { recentRunIds: [] }]) {
    assert.throws(() => minimalRearm(JSON.stringify({ ...fixture, ...change })));
  }
});
