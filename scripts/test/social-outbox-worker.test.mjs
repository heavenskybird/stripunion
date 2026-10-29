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
 const receipts=new Map();let calls=0;
 globalThis.fetch=async(raw,opts={})=>{
  const url=new URL(raw);const body=opts.body?JSON.parse(opts.body):null;
  if(url.hostname==='api.github.com'){
   if(url.pathname.includes('/branches/'))return Response.json({name:'test'});
   if(url.pathname.includes('/contents/')){
    if(!opts.method||opts.method==='GET')return new Response('',{status:404});
    receipts.set(url.pathname,body);return Response.json({content:{sha:String(receipts.size)}});
   }
  }
  if(url.hostname==='api.buffer.com'){
   calls++;await fs.writeFile(${JSON.stringify(path.join(dir,'calls.json'))},JSON.stringify({calls}));
   return Response.json({data:{createPost:{post:{id:'provider-test',dueAt:body.variables.input.dueAt,status:'scheduled'}}}});
  }
  if(url.hostname==='api.telegram.org'){
   calls++;await fs.writeFile(${JSON.stringify(path.join(dir,'calls.json'))},JSON.stringify({calls}));
   return Response.json({ok:true,result:{message_id:calls}});
  }
  throw Error('Unexpected request blocked by test');
 };`);
 try {
  execFileSync(process.execPath,['--import',preload,worker],{cwd:dir,encoding:'utf8',env:{...process.env,
   GITHUB_REPOSITORY:'heavenskybird/stripunion',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW:'Native social outbox',GH_TOKEN:'test-only',
   SOCIAL_OUTBOX_SEND_ENABLED:'true',SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED:'true',SOCIAL_OUTBOX_BATCH_SIZE:'5',TELEGRAM_BOT_TOKEN:'test-only',TELEGRAM_CHANNEL_ID:'@test',
   BUFFER_API_KEY:'test-only',BUFFER_CHANNEL_ID:'test',SOCIAL_OUTBOX_RECONCILIATION_FILE:snapshot,...extra}});
  const after=await Promise.all(rows.map((_,i)=>fs.readFile(path.join(events,`${i}.json`),'utf8').then(JSON.parse)));
  const calls=await fs.readFile(path.join(dir,'calls.json'),'utf8').then(JSON.parse).catch(()=>({calls:0}));
  return{after,...calls};
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
