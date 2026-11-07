import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const script=new URL('../social-outbox-reconcile-buffer.mjs',import.meta.url).pathname;
const event={state:'reconcile_required',channel:'x',provider:'buffer',slug:'example',idempotency_key:'example:x'};
const post=(id,host='stripunion.com')=>({id,text:`https://${host}/guides/example`,status:'sent',channelId:'test',sentAt:'2026-10-29T00:00:00Z'});
const page=posts=>({edges:posts.map(node=>({node})),pageInfo:{hasNextPage:false,endCursor:null}});
async function reconcile(events,result){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'su-reconcile-'));const out=path.join(dir,'ops/social-outbox/events');await fs.mkdir(out,{recursive:true});
 for(const[i,e]of events.entries())await fs.writeFile(path.join(out,`${i}.json`),JSON.stringify(e));
 const preload=path.join(dir,'mock.mjs');await fs.writeFile(preload,`globalThis.fetch=async(_url,opts)=>{const body=JSON.parse(opts.body);return Response.json({data:body.query.includes('query Channel')?{channel:{id:'test',organizationId:'test-org'}}:{posts:${JSON.stringify(result)}}});};`);
 const snapshot=path.join(dir,'snapshot.json');let error=null;
 try{
  try{execFileSync(process.execPath,['--import',preload,script],{cwd:dir,encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{...process.env,BUFFER_API_KEY:'test-only',BUFFER_CHANNEL_ID:'test',SOCIAL_OUTBOX_RECONCILIATION_FILE:snapshot}});}catch(e){error=e;}
  return{error,events:await Promise.all(events.map((_,i)=>fs.readFile(path.join(out,`${i}.json`),'utf8').then(JSON.parse))),snapshot:await fs.stat(snapshot).then(()=>true).catch(()=>false)};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('provider confirmation resolves only an unambiguous canonical match',async()=>{
 const r=await reconcile([event],page([post('real')]));assert.equal(r.error,null);assert.equal(r.events[0].state,'delivered');assert.equal(r.events[0].provider_message_id,'real');assert.equal(r.snapshot,true);
});
test('ambiguous slugs and unrelated hosts never manufacture receipts',async()=>{
 for(const posts of [[post('a'),post('b')],[post('foreign','example.invalid')]]){
  const r=await reconcile([event],page(posts));assert.equal(r.events[0].state,'reconcile_required');assert.equal(r.events[0].provider_message_id,undefined);
 }
});
test('existing provider message identity wins over slug ambiguity',async()=>{
 const r=await reconcile([{...event,provider_message_id:'b'}],page([post('a'),post('b')]));assert.equal(r.events[0].provider_message_id,'b');assert.equal(r.events[0].state,'delivered');
});
test('truncated or malformed provider evidence blocks sends without changing events',async()=>{
 for(const data of [{edges:[],pageInfo:{hasNextPage:true,endCursor:'repeat'}},{edges:[]},page([{...post('bad'),channelId:'wrong'}])]){
  const r=await reconcile([event],data);assert.ok(r.error);assert.equal(r.snapshot,false);assert.deepEqual(r.events[0],event);
 }
});
