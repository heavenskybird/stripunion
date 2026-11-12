import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { outboxAdmission } from '../social-outbox-admission.mjs';

test('operator pause is explicit; enable requires canonical main and valid configuration', () => {
  for (const flag of ['false', 'FALSE', undefined]) assert.deepEqual(outboxAdmission(flag), { state: 'PAUSED_BY_OPERATOR', sendEnabled: false });
  assert.throws(() => outboxAdmission('true', { repository: 'heavenskybird/stripunion', ref: 'refs/heads/codex/recovery-integration-20261111' }), /canonical main/);
  assert.throws(() => outboxAdmission('invalid'), /Invalid/);
  assert.equal(outboxAdmission('true', { repository: 'heavenskybird/stripunion', ref: 'refs/heads/main' }).sendEnabled, true);
});
test('actual paused CLI emits summary/output with zero network or provider work', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'outbox-paused-'));
  try {
    const preload = path.join(dir, 'network-block.mjs');
    const calls = path.join(dir, 'network-call');
    await fs.writeFile(preload, `import fs from 'node:fs';globalThis.fetch=()=>{fs.writeFileSync(${JSON.stringify(calls)},'unexpected');throw Error('Network prohibited');};`);
    const output = path.join(dir, 'outputs'); const summary = path.join(dir, 'summary');
    const stdout = execFileSync(process.execPath, ['--import', preload, fileURLToPath(new URL('../social-outbox-admission.mjs', import.meta.url))], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, SOCIAL_OUTBOX_SEND_ENABLED: 'false', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary }
    });
    assert.match(stdout, /PAUSED_BY_OPERATOR/);
    assert.match(await fs.readFile(output, 'utf8'), /send_enabled=false/);
    assert.match(await fs.readFile(summary, 'utf8'), /intentional pause, not delivery success/);
    await assert.rejects(fs.access(calls), { code: 'ENOENT' });
    await assert.rejects(fs.access(path.join(dir, 'ops')), { code: 'ENOENT' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('scheduled workflow gates every operational step, while enabled failures and SEO degradation stay visible', async () => {
  const workflow = await fs.readFile(new URL('../../.github/workflows/social-outbox.yml', import.meta.url), 'utf8');
  const steps = workflow.split('      - name: ');
  for (const name of ['Install dependencies', 'Sync publication ledger', 'Reconcile historical Buffer', 'Process safe pending', 'Report outbox state', 'Persist native outbox state', 'Retain visible reconciliation']) {
    const step = steps.find(s => s.startsWith(name)); assert.ok(step, name);
    assert.ok(step.includes("steps.operator.outputs.send_enabled == 'true'"), name);
  }
  assert.ok(steps.find(s => s.startsWith('Retain visible reconciliation')).includes("steps.reconcile_buffer.outcome == 'failure'"));
  const seo = await fs.readFile(new URL('../../.github/workflows/seo-data-daily.yml', import.meta.url), 'utf8');
  const collect = seo.split('      - name: Collect Buffer performance')[1].split('      - name: ')[0];
  assert.ok(!collect.includes('steps.operator') && !collect.includes('SOCIAL_OUTBOX_SEND_ENABLED'));
  assert.ok(seo.includes('BUFFER_OUTCOME: ${{ steps.collect_buffer.outcome }}'));
});
