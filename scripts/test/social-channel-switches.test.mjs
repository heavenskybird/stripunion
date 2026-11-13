import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { socialChannelSwitches, assertNativeChannel } from '../social-channel-switches.mjs';
import { runtimePreflight } from '../social-outbox-runtime-preflight.mjs';
import { createBufferPost } from '../../ops/seo-data-layer/src/distribution/buffer.mjs';
import { publishTelegramEvent } from '../../ops/seo-data-layer/src/distribution/telegram.mjs';

const accepted = { SOCIAL_OUTBOX_SEND_ENABLED: 'true', SOCIAL_OUTBOX_X_SEND_ENABLED: 'true',
  SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED: 'true', SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED: 'true',
  GITHUB_REPOSITORY: 'heavenskybird/stripunion', GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW: 'Native social outbox', GITHUB_RUN_ATTEMPT: '1' };

test('operator false wins every channel combination; unset channel switches default off', () => {
  for (const x of ['true', 'false', 'invalid', undefined]) for (const telegram of ['true', 'false', 'invalid', undefined]) {
    assert.deepEqual(socialChannelSwitches({ SOCIAL_OUTBOX_SEND_ENABLED: 'false',
      SOCIAL_OUTBOX_X_SEND_ENABLED: x, SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED: telegram }),
    { globalEnabled: false, x: false, telegram: false });
  }
  assert.deepEqual(socialChannelSwitches({ SOCIAL_OUTBOX_SEND_ENABLED: 'true' }), { globalEnabled: true, x: false, telegram: false });
  assert.throws(() => socialChannelSwitches({ SOCIAL_OUTBOX_SEND_ENABLED: 'true', SOCIAL_OUTBOX_X_SEND_ENABLED: 'invalid' }), /Invalid/);
});

test('accepted single writer is mandatory; no legacy or historical-run send fallback', () => {
  for (const change of [{ SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED: 'false' }, { GITHUB_WORKFLOW: 'Telegram evergreen distribution' },
    { GITHUB_REF: 'refs/heads/codex/test' }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_REPOSITORY: 'other/repo' }]) {
    assert.throws(() => assertNativeChannel('telegram', { ...accepted, ...change }), /canonical Native single writer/);
  }
});

test('actual sender adapters reject channel-off and legacy contexts before any network request', async () => {
  const names = Object.keys(accepted);
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const beforeFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests++; throw Error('Network forbidden'); };
  try {
    Object.assign(process.env, accepted, { SOCIAL_OUTBOX_X_SEND_ENABLED: 'false' });
    await assert.rejects(createBufferPost({ text: 'test' }), /disabled by channel/);
    Object.assign(process.env, accepted, { SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED: 'false' });
    await assert.rejects(publishTelegramEvent({ source: 'social_outbox' }), /disabled by channel/);
    Object.assign(process.env, accepted, { GITHUB_WORKFLOW: 'Social distribution', SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED: 'false' });
    await assert.rejects(createBufferPost({ text: 'test' }), /canonical Native single writer/);
    await assert.rejects(publishTelegramEvent({ source: 'legacy' }), /canonical Native single writer/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = beforeFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});

test('runtime preflight is read-only, paused before even GitHub reads, and fails closed when missing', async () => {
  let requests = 0;
  const api = async endpoint => { requests++; assert.ok(endpoint.startsWith('branches/')); return { name: 'codex/social-outbox-runtime', commit: { sha: 'a'.repeat(40) } }; };
  assert.deepEqual(await runtimePreflight({ env: { ...accepted, SOCIAL_OUTBOX_SEND_ENABLED: 'false' }, api }), { state: 'PAUSED', requests: 0 });
  assert.equal(requests, 0);
  assert.equal((await runtimePreflight({ env: accepted, api })).state, 'RUNTIME_BRANCH_VERIFIED');
  assert.equal(requests, 1);
  await assert.rejects(runtimePreflight({ env: accepted, api: async () => null }), /missing or unreadable/);
});

test('actual reconciler makes zero Buffer/GitHub requests when globally paused or Telegram-only', async () => {
  const script = new URL('../social-outbox-reconcile-buffer.mjs', import.meta.url).pathname;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'su-channel-reconcile-'));
  try {
    const preload = path.join(dir, 'network-block.mjs');
    const called = path.join(dir, 'unexpected-request');
    await fs.writeFile(preload, `import fs from 'node:fs';globalThis.fetch=()=>{fs.writeFileSync(${JSON.stringify(called)},'called');throw Error('Network forbidden');};`);
    for (const change of [{ SOCIAL_OUTBOX_SEND_ENABLED: 'false' }, { SOCIAL_OUTBOX_X_SEND_ENABLED: 'false' }]) {
      const stdout = execFileSync(process.execPath, ['--import', preload, script], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, ...accepted, ...change, BUFFER_API_KEY: 'test-only', BUFFER_CHANNEL_ID: 'test-only' }
      });
      assert.match(stdout, /providerRequests":0/);
      await assert.rejects(fs.access(called), { code: 'ENOENT' });
      await assert.rejects(fs.access(path.join(dir, 'ops')), { code: 'ENOENT' });
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Native workflow skips Buffer step in Telegram-only mode and preserves independent SEO failure collection', async () => {
  const text = await fs.readFile(new URL('../../.github/workflows/social-outbox.yml', import.meta.url), 'utf8');
  const step = text.split('      - name: Reconcile historical Buffer deliveries')[1].split('      - name: ')[0];
  assert.ok(step.includes("steps.operator.outputs.send_enabled == 'true' && steps.operator.outputs.x_send_enabled == 'true'"));
  assert.ok(text.includes('scripts/social-outbox-runtime-preflight.mjs'));
  for (const name of ['SOCIAL_OUTBOX_X_SEND_ENABLED', 'SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED']) assert.ok(text.includes(`${name}: \${{ vars.${name} || 'false' }}`));
  const seo = await fs.readFile(new URL('../../.github/workflows/seo-data-daily.yml', import.meta.url), 'utf8');
  const collect = seo.split('      - name: Collect Buffer performance')[1].split('      - name: ')[0];
  assert.ok(!collect.includes('SOCIAL_OUTBOX_X_SEND_ENABLED') && !collect.includes('SOCIAL_OUTBOX_SEND_ENABLED'));
});
