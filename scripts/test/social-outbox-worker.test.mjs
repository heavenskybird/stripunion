import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const worker=new URL('../social-outbox-worker.mjs',import.meta.url).pathname;
async function scenario(rows, extra={}) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'su-outbox-'));
 const events=path.join(dir,'ops/social-outbox/events');await fs.mkdir(events,{recursive:true});
 for(const [i,row] of rows.entries())await fs.writeFile(path.join(events,`${i}.json`),JSON.stringify(row));
 const snapshot=path.join(dir,'provider.json');await fs.writeFile(snapshot,JSON.stringify({checked_at:new Date().toISOString(),channel_id:'test',posts:[]}));
 const preload=path.join(dir,'mock.mjs');
 await fs.writeFile(preload,`import fs from 'node:fs/promises';
 const receipts=new Map();let calls=0,bufferCalls=0,telegramCalls=0,githubCalls=0;
 const save=()=>fs.writeFile(${JSON.stringify(path.join(dir,'calls.json'))},JSON.stringify({calls,bufferCalls,telegramCalls,githubCalls}));
 globalThis.fetch=async(raw,opts={})=>{
  const url=new URL(raw);const body=opts.body?JSON.parse(opts.body):null;
  if(url.hostname==='api.github.com'){
   githubCalls++;await save();
   if(url.pathname.includes('/branches/'))return Response.json({name:'test'});
   if(url.pathname.includes('/contents/')){
    if(!opts.method||opts.method==='GET')return receipts.has(url.pathname)?Response.json({content:receipts.get(url.pathname).content,sha:String(receipts.size)}):new Response('',{status:404});
    receipts.set(url.pathname,body);return Response.json({content:{sha:String(receipts.size)}});
   }
  }
  if(url.hostname==='api.buffer.com'){
   calls++;bufferCalls++;await save();
   return Response.json({data:{createPost:{post:{id:'provider-test',dueAt:body.variables.input.dueAt,status:'scheduled'}}}});
  }
  if(url.hostname==='api.telegram.org'){
   calls++;telegramCalls++;await save();
   if(process.env.TEST_TELEGRAM_PROVIDER_FAILURE==='true')throw Error('Mock provider timeout after possible acceptance');
   return Response.json({ok:true,result:{message_id:calls,chat:{username:'StripUnion'}}});
  }
  throw Error('Unexpected request blocked by test');
 };`);
 try {
  let error=null,stdout='';
  try{stdout=execFileSync(process.execPath,['--import',preload,worker],{cwd:dir,encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{...process.env,
   GITHUB_REPOSITORY:'heavenskybird/stripunion',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW:'Native social outbox',GH_TOKEN:'test-only',
   SOCIAL_OUTBOX_SEND_ENABLED:'true',SOCIAL_OUTBOX_X_SEND_ENABLED:'true',SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED:'true',SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED:'true',SOCIAL_OUTBOX_BATCH_SIZE:'5',TELEGRAM_BOT_TOKEN:'test-only',TELEGRAM_CHANNEL_ID:'@test',
   BUFFER_API_KEY:'test-only',BUFFER_CHANNEL_ID:'test',SOCIAL_OUTBOX_RECONCILIATION_FILE:snapshot,...extra}});}catch(e){error=e;}
  const after=await Promise.all(rows.map((_,i)=>fs.readFile(path.join(events,`${i}.json`),'utf8').then(JSON.parse)));
  const calls=await fs.readFile(path.join(dir,'calls.json'),'utf8').then(JSON.parse).catch(()=>({calls:0,bufferCalls:0,telegramCalls:0,githubCalls:0}));
  return{after,error,stdout,...calls};
 } finally {await fs.rm(dir,{recursive:true,force:true});}
}
const event=(i,state='pending')=>({state,idempotency_key:`test:${i}`,channel:'telegram',provider:'telegram',slug:`test-${i}`,title:'Test',url:`https://stripunion.com/test-${i}`,attempt_count:0,last_attempt_at:state==='delivered'?new Date().toISOString():null});
test('actual worker stops at Telegram 100/day and preserves reconciliations',async()=>{
 const rows=Array.from({length:98},(_,i)=>event(i,'delivered'));
 rows.push(event(98),event(99),event(100),event(101,'reconcile_required'));
 const result=await scenario(rows);assert.equal(result.calls,2);
 assert.equal(result.after.filter(r=>r.state==='delivered').length,100);
 assert.equal(result.after.slice(98,101).filter(r=>r.state==='pending').length,1);assert.equal(result.after[101].state,'reconcile_required');
});
test('actual worker never replays a legacy uncertain attempt',async()=>{
 const result=await scenario([{...event(0),state:'retryable',attempt_count:1}]);
 assert.equal(result.calls,0);assert.equal(result.after[0].state,'reconcile_required');
});
test('disabled actual worker leaves provider and event state untouched',async()=>{
 const result=await scenario([event(0)],{SOCIAL_OUTBOX_SEND_ENABLED:'false'});
 assert.equal(result.calls,0);assert.equal(result.after[0].attempt_count,0);
});

test('actual worker caps X at 20 and enforces spacing',async()=>{
 const old=new Date(Date.now()-60*60000).toISOString();
 const rows=Array.from({length:19},(_,i)=>({...event(i,'delivered'),channel:'x',provider:'buffer',provider_message_id:String(i),provider_due_at:new Date().toISOString(),last_attempt_at:old}));
 rows.push(...[19,20,21].map(i=>({...event(i),channel:'x',provider:'buffer'})));
 const result=await scenario(rows);assert.equal(result.calls,1);
 assert.equal(result.after.filter(r=>r.state==='scheduled').length,1);
 assert.equal(result.after.filter(r=>r.state==='pending').length,2);
});

test('Buffer reconciliation failure holds X while Telegram can deliver exactly once', async()=>{
 const rows=[{...event(0),channel:'x',provider:'buffer'},event(1)];
 const result=await scenario(rows,{BUFFER_RECONCILIATION_OUTCOME:'failure',SOCIAL_OUTBOX_RECONCILIATION_FILE:'/tmp/absent-buffer-evidence-for-test'});
 assert.equal(result.calls,1);
 assert.equal(result.after[0].state,'pending');
 assert.equal(result.after[0].attempt_count,0);
 assert.equal(result.after[1].state,'delivered');
});

test('Telegram-only processing does not read Buffer evidence', async()=>{
 const result=await scenario([event(0)],{SOCIAL_OUTBOX_RECONCILIATION_FILE:'/tmp/absent-buffer-evidence-for-test'});
 assert.equal(result.calls,1);assert.equal(result.after[0].state,'delivered');
});

test('actual worker defaults both channels off even with the global switch enabled', async()=>{
 const rows=[{...event(0),channel:'x',provider:'buffer'},event(1)];
 const result=await scenario(rows,{SOCIAL_OUTBOX_X_SEND_ENABLED:'',SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED:''});
 // Empty values are malformed, not authorization to send.
 assert.ok(result.error);assert.equal(result.calls,0);assert.deepEqual(result.after,rows);
 const unset=await scenario(rows,{SOCIAL_OUTBOX_X_SEND_ENABLED:'false',SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED:'false'});
 assert.equal(unset.error,null);assert.equal(unset.calls,0);assert.equal(unset.githubCalls,0);assert.deepEqual(unset.after,rows);
 const absent=await scenario(rows,{SOCIAL_OUTBOX_X_SEND_ENABLED:undefined,SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED:undefined});
 assert.equal(absent.error,null);assert.equal(absent.calls,0);assert.equal(absent.githubCalls,0);assert.deepEqual(absent.after,rows);
});

test('Telegram-only runtime sends one new event with zero Buffer credentials, calls or reconciliation dependency', async()=>{
 const rows=[{...event(0),channel:'x',provider:'buffer'},event(1)];
 const result=await scenario(rows,{SOCIAL_OUTBOX_X_SEND_ENABLED:'false',BUFFER_API_KEY:'',BUFFER_CHANNEL_ID:'',
  BUFFER_RECONCILIATION_OUTCOME:'failure',SOCIAL_OUTBOX_RECONCILIATION_FILE:'/tmp/never-read-buffer-evidence'});
 assert.equal(result.error,null);assert.equal(result.bufferCalls,0);assert.equal(result.telegramCalls,1);
 assert.deepEqual(result.after[0],rows[0]);assert.equal(result.after[1].state,'delivered');
});

test('global operator pause blocks both channels and every GitHub/provider request', async()=>{
 const rows=[{...event(0),channel:'x',provider:'buffer'},event(1)];
 for(const x of ['true','false'])for(const telegram of ['true','false']){
  const result=await scenario(rows,{SOCIAL_OUTBOX_SEND_ENABLED:'false',SOCIAL_OUTBOX_X_SEND_ENABLED:x,SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED:telegram});
  assert.equal(result.error,null);assert.equal(result.calls,0);assert.equal(result.githubCalls,0);assert.deepEqual(result.after,rows);
 }
});

test('X enabled but Buffer reconciliation cooling down holds X while Telegram proceeds independently', async()=>{
 const result=await scenario([{...event(0),channel:'x',provider:'buffer'},event(1)],{BUFFER_RECONCILIATION_OUTCOME:'failure'});
 assert.equal(result.bufferCalls,0);assert.equal(result.telegramCalls,1);assert.equal(result.after[0].state,'pending');
});

test('unaccepted writer and historical retry context cannot make any provider or journal request', async()=>{
 for(const extra of [{SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED:'false'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_WORKFLOW:'Telegram evergreen distribution'}]){
  const result=await scenario([event(0)],extra);assert.ok(result.error);assert.equal(result.calls,0);assert.equal(result.githubCalls,0);
 }
});

test('all 73 legacy unknowns remain byte-equivalent objects and never consume capacity or provider calls', async()=>{
 const rows=Array.from({length:73},(_,i)=>({...event(i,'reconcile_required'),channel:i<28?'x':'telegram',provider:i<28?'buffer':'telegram'}));
 const result=await scenario(rows);assert.equal(result.error,null);assert.equal(result.calls,0);assert.equal(result.githubCalls,0);assert.deepEqual(result.after,rows);
});

test('duplicate pending identities cannot send twice within the accepted native writer', async()=>{
 const row=event(0);
 const result=await scenario([row,{...row}]);assert.equal(result.error,null);assert.equal(result.telegramCalls,1);
 assert.equal(result.after[0].provider_message_id,result.after[1].provider_message_id);
});

test('Telegram provider failure is quarantined while Buffer failure cannot trigger a second irreversible call', async()=>{
 const rows=[{...event(0),channel:'x',provider:'buffer'},event(1)];
 const result=await scenario(rows,{BUFFER_RECONCILIATION_OUTCOME:'failure',TEST_TELEGRAM_PROVIDER_FAILURE:'true'});
 assert.equal(result.calls,1);
 assert.equal(result.after[0].state,'pending');
 assert.equal(result.after[1].state,'reconcile_required');
 assert.match(result.after[1].last_error,/reconciliation/);
 const held=await scenario(result.after,{BUFFER_RECONCILIATION_OUTCOME:'failure',TEST_TELEGRAM_PROVIDER_FAILURE:'true'});
 assert.equal(held.calls,0);
 assert.equal(held.after[1].state,'reconcile_required');
});

test('exact one-new-event trial selector cannot send older pending or unknown entries',async()=>{
 const rows=[event(0),event(1),event(2,'reconcile_required')];
 const r=await scenario(rows,{SOCIAL_OUTBOX_X_SEND_ENABLED:'false',SOCIAL_OUTBOX_TRIAL_EVENT_KEY:'test:1',SOCIAL_OUTBOX_TELEGRAM_DAILY_CAP:'1',SOCIAL_OUTBOX_BATCH_SIZE:'1'});
 assert.equal(r.error,null);assert.equal(r.telegramCalls,1);assert.equal(r.bufferCalls,0);assert.deepEqual(r.after[0],rows[0]);assert.equal(r.after[1].state,'delivered');assert.deepEqual(r.after[2],rows[2]);
 const next=await scenario(r.after,{SOCIAL_OUTBOX_X_SEND_ENABLED:'false',SOCIAL_OUTBOX_TRIAL_EVENT_KEY:'test:1',SOCIAL_OUTBOX_TELEGRAM_DAILY_CAP:'1',SOCIAL_OUTBOX_BATCH_SIZE:'1'});assert.equal(next.calls,0);
 const missing=await scenario(rows,{SOCIAL_OUTBOX_TRIAL_EVENT_KEY:'absent:approved'});assert.equal(missing.calls,0);assert.deepEqual(missing.after,rows);
});

test('autonomous worker suppresses manual URL and historic unknown, spaces distinct new posts with zero Buffer calls',async()=>{
 const selected=(i,title,url)=>({...event(i),title,url,selection_source:'official-search-demand',selection_checked_at:new Date().toISOString()});
 const manual=selected(301,'Stripchat mobile browser shortcut guide','https://www.stripunion.com/stripchat-app/?utm_source=other');
 const unknown={...event(302,'reconcile_required'),url:'https://stripunion.com/livejasmin/',title:'LiveJasmin private rooms and credit model'};
 const copy=selected(303,'LiveJasmin private rooms and credit model','https://stripunion.com/livejasmin/');
 const fresh=selected(304,'Chaturbate alternatives compared by public room and private interaction','https://stripunion.com/chaturbate-alternatives/');
 const later=selected(305,'xHamster platform category and browsing alternatives','https://stripunion.com/xhamster/');
 const result=await scenario([manual,unknown,copy,fresh,later],{TELEGRAM_AUTONOMY_ENABLED:'true',TELEGRAM_CHANNEL_ID:'@StripUnion',SOCIAL_OUTBOX_X_SEND_ENABLED:'false'});
 assert.equal(result.error,null);assert.equal(result.telegramCalls,1,result.stdout+JSON.stringify(result.after.slice(3)));assert.equal(result.bufferCalls,0);
 assert.deepEqual(result.after[1],unknown);assert.equal(result.after[0].state,'pending');assert.equal(result.after[2].state,'pending');assert.equal(result.after[4].state,'pending');
 assert.equal(result.after[3].state,'delivered');assert.equal(result.after[3].delivery_evidence.provider_message_url,'https://t.me/StripUnion/1');assert.match(result.after[3].delivery_evidence.content_hash,/^[a-f0-9]{64}$/);
});
