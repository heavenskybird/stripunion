import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import YAML from 'yaml';
const load=async name=>YAML.parse(await fs.readFile(new URL(`../../.github/workflows/${name}`,import.meta.url),'utf8'));
test('every legacy sender is serialized and excluded after outbox cutover',async()=>{
 const senders={'social-distribution.yml':'queue-social-post','telegram-evergreen.yml':'publish','editorial-distribution.yml':'distribute-new-guides','telegram-bootstrap.yml':'publish-first-telegram-message','editorial-backfill-2026-10-04.yml':'backfill'};
 for(const [name,job] of Object.entries(senders)){
  const workflow=await load(name);assert.equal(workflow.concurrency.group,'native-social-outbox',name);
  assert.ok(workflow.jobs[job].if.includes("SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED != 'true'"),name);
  if(/bootstrap|backfill/.test(name))assert.ok(workflow.jobs[job].if.includes("SOCIAL_LEGACY_REPLAY_ENABLED == 'true'"),name);
 }
});
test('native sender keeps original 15-minute cron, wakeup is guarded and shares its lock',async()=>{
 const native=await load('social-outbox.yml'),wake=await load('social-outbox-heartbeat.yml');
 assert.equal(native.on.schedule[0].cron,'*/15 * * * *');
 assert.equal(wake.concurrency.group,native.concurrency.group);
 assert.equal(wake.concurrency['cancel-in-progress'],false);
 assert.ok(wake.jobs.wake.if.includes("SOCIAL_OUTBOX_HEARTBEAT_ENABLED == 'true'"));
 assert.ok(wake.jobs.wake.if.includes('head_repository.full_name == github.repository'));
 assert.ok(wake.jobs.wake.if.includes("github.ref == 'refs/heads/main'"));
 assert.equal(wake.on.pull_request,undefined);
});
