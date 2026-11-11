import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createBufferPost } from '../../ops/seo-data-layer/src/distribution/buffer.mjs';
import { publishTelegramEvent } from '../../ops/seo-data-layer/src/distribution/telegram.mjs';
test('operator false prevents every adapter request even before single-writer activation', async () => {
  const before = process.env.SOCIAL_OUTBOX_SEND_ENABLED;
  const fetchBefore = globalThis.fetch;
  let calls = 0;
  process.env.SOCIAL_OUTBOX_SEND_ENABLED = 'false';
  globalThis.fetch = async () => { calls++; throw Error('Network must not be reached'); };
  try {
    await assert.rejects(createBufferPost({ text: 'test' }), /disabled by operator/);
    await assert.rejects(publishTelegramEvent({ source: 'legacy', title: 'test', url: 'https://stripunion.com' }), /disabled by operator/);
    await assert.rejects(publishTelegramEvent({ source: 'social_outbox', title: 'test', url: 'https://stripunion.com' }), /disabled by operator/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = fetchBefore;
    if (before === undefined) delete process.env.SOCIAL_OUTBOX_SEND_ENABLED; else process.env.SOCIAL_OUTBOX_SEND_ENABLED = before;
  }
});
test('all legacy workflow send jobs require explicit operator true', async () => {
  for (const name of ['social-distribution','editorial-distribution','editorial-backfill-2026-10-04','telegram-bootstrap','telegram-evergreen']) {
    const text = await fs.readFile(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
    assert.ok(text.includes("if: vars.SOCIAL_OUTBOX_SEND_ENABLED == 'true' &&"), name);
    assert.ok(text.includes("SOCIAL_OUTBOX_SEND_ENABLED: ${{ vars.SOCIAL_OUTBOX_SEND_ENABLED || 'false' }}"), name);
  }
});
