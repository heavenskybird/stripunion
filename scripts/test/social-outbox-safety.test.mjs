import test from 'node:test';
import assert from 'node:assert/strict';
import { wakeDecision, validateCap, deliverOnce, journal, providerDayUsage } from '../social-outbox-safety.mjs';
const now = Date.parse('2026-10-29T14:00:00Z');
const run = (age, extra={}) => ({head_branch:'main',status:'completed',conclusion:'success',created_at:new Date(now-age*60000).toISOString(),...extra});
test('stale boundary, active writer, missing/future evidence and bounded failure',()=>{
 assert.equal(wakeDecision([run(29.99)],now).action,'skip');
 assert.equal(wakeDecision([run(30)],now).action,'wake');
 assert.equal(wakeDecision([run(60),run(5,{status:'queued'})],now).reason,'active-writer');
 assert.equal(wakeDecision([],now).action,'blocked');
 assert.equal(wakeDecision([run(-1)],now).action,'blocked');
 assert.equal(wakeDecision([31,32,33].map(n=>run(n,{conclusion:'failure'})),now).action,'blocked');
});
test('caps reject malformed values and attempts to raise ceilings',()=>{
 for(const v of ['NaN',-1,20.1,21,Infinity]) assert.throws(()=>validateCap(v,20));
 assert.equal(validateCap(0,20),0); assert.equal(validateCap(100,100),100);
});
const event={state:'pending',idempotency_key:'publication:1:x'};
test('remote claim precedes send, uncertain provider result never replays',async()=>{
 const writes=[]; let sends=0;
 const store={state:null,write:async r=>writes.push(r)};
 const result=await deliverOnce(event,async()=>{assert.equal(writes.length,1);sends++;throw Error('timeout');},store,now);
 assert.equal(result.held,true);
 const next=await deliverOnce(event,async()=>sends++,{...store,state:writes[0]},now);
 assert.equal(next.held,true);assert.equal(sends,1);
});
test('CAS loser and missing branch cannot send',async()=>{
 let sends=0;
 await assert.rejects(deliverOnce(event,async()=>sends++,{state:null,write:async()=>{throw Error('409');}},now));
 assert.equal(sends,0);await assert.rejects(journal(event,async()=>null));
});
test('provider receipt is persisted, no blind reconcile_required or missing receipt',async()=>{
 let sends=0;const writes=[];const store={state:null,write:async r=>writes.push(r)};
 const result=await deliverOnce(event,async()=>{sends++;return{id:'real-id',state:'scheduled',dueAt:'2026-10-30T00:00:00Z'};},store,now);
 assert.equal(result.receipt.provider_message_id,'real-id');assert.equal(writes.length,2);
 await deliverOnce({...event,state:'reconcile_required'},async()=>sends++,store,now);assert.equal(sends,1);
 assert.equal((await deliverOnce(event,async()=>({state:'delivered'}),store,now)).held,true);
});
test('journal uses refreshed SHA for completion and stable identity',async()=>{
 const calls=[];
 const api=async(p,m,b)=>{calls.push({p,m,b});if(p.startsWith('branches/'))return{};if(!m)return null;return{content:{sha:'claim-sha'}};};
 const store=await journal(event,api);await store.write({status:'reconcile_required'});await store.write({status:'delivered'});
 assert.equal(calls.at(-1).b.sha,'claim-sha');assert.equal(calls.at(-1).b.branch,'codex/social-outbox-runtime');
});

test('legacy attempts held without new provider call',async()=>{
 let sends=0;const result=await deliverOnce({...event,attempt_count:1},async()=>sends++,{state:null,write:async()=>{}},now);
 assert.equal(result.held,true);assert.equal(sends,0);
});

test('outbox Telegram timeout makes exactly one irreversible call', async()=>{
 const before=globalThis.fetch;const token=process.env.TELEGRAM_BOT_TOKEN;const channel=process.env.TELEGRAM_CHANNEL_ID;
 process.env.TELEGRAM_BOT_TOKEN='test-only';process.env.TELEGRAM_CHANNEL_ID='@test-only';
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('timeout after acceptance');};
 try {
  const {publishTelegramEvent}=await import('../../ops/seo-data-layer/src/distribution/telegram.mjs?outbox-test');
  await assert.rejects(publishTelegramEvent({source:'social_outbox',title:'Test',url:'https://stripunion.com/test'}));
  assert.equal(calls,1);
 } finally {globalThis.fetch=before;if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token;if(channel===undefined)delete process.env.TELEGRAM_CHANNEL_ID;else process.env.TELEGRAM_CHANNEL_ID=channel;}
});

test('X cap uses the union of provider and local receipts, without double counting',()=>{
 const day=v=>v?String(v).slice(0,10):null;
 const posts=[{id:'a',dueAt:'2026-10-30T00:00:00Z'},{id:'b',sentAt:'2026-10-30T01:00:00Z'}];
 const events=[{channel:'x',state:'scheduled',provider_message_id:'a',provider_due_at:'2026-10-30T00:00:00Z'},{channel:'x',state:'scheduled',provider_message_id:'c',provider_due_at:'2026-10-30T02:00:00Z'}];
 assert.equal(providerDayUsage(posts,events,'2026-10-30',day),3);
 assert.equal(providerDayUsage(posts,events,'2026-10-29',day),0);
});
