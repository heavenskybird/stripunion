import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../../src/components/LiveModelsGrid.astro', import.meta.url),'utf8').match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const model={id:1,username:'fixture',status:'public',snapshotUrl:'https://cdn.example.invalid/image.jpg'};
const fresh=now=>({ok:true,stale:false,refreshedAt:new Date(now).toISOString(),validUntil:new Date(now+90_000).toISOString(),models:[model]});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(payload = fresh, {visible=true, latency=0}={}) {
  let now=1_000_000;
  const transitions=[];
  class Element {
    constructor() { this.dataset={}; this.children=[]; this.hidden=true; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children=items; if(this===grid)transitions.push({now,count:items.length}); }
    setAttribute() {}
  }
  const root=new Element(), grid=new Element(), status=new Element(), fallback=new Element();
  root.dataset={endpoint:'https://api.example.invalid/models',userId:'fixture',trackingBase:'https://go.whitetrafsa.com/'};
  root.querySelector=s=>({'[data-live-grid]':grid,'[data-live-status]':status,'[data-live-fallback]':fallback})[s];
  const events={}, docEvents={}, timers=new Map();let next=1, fail=false, calls=0, observer;
  const schedule=(fn,ms)=>{const id=next++;timers.set(id,{fn,at:now+ms,ms});return id;};
  const document={hidden:false,hasFocus:()=>true,querySelector:()=>root,createElement:()=>new Element(),addEventListener:(n,f)=>docEvents[n]=f};
  const navigator={onLine:true};
  const window={location:{pathname:'/avcams'},addEventListener:(n,f)=>events[n]=f,
    IntersectionObserver:class {constructor(fn){observer=fn;}observe(){}}};
  class ClockDate extends Date {static now(){return now;}}
  vm.runInNewContext(source,{HTMLElement:Element,document,window,navigator,URL,AbortSignal,AbortController,Date:ClockDate,
    fetch:async()=>{calls++;if(latency)await new Promise(resolve=>schedule(resolve,latency));if(fail)throw Error('network');return {ok:true,json:async()=>typeof payload==='function'?payload(now):payload};},
    setTimeout:schedule,clearTimeout:id=>timers.delete(id)});
  const enter=intersecting=>observer([{isIntersecting:intersecting}]);
  if(visible)enter(true);
  return {grid,fallback,events,docEvents,document,navigator,timers,transitions,window,enter,calls:()=>calls,fail:()=>fail=true,
    async advance(ms){const target=now+ms;await settle();while(true){const nextTimer=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!nextTimer)break;const[id,t]=nextTimer;timers.delete(id);now=t.at;t.fn();await settle();}now=target;await settle();},
    analytics:name=>(window.dataLayer||[]).filter(e=>e.event===name)};
}
test('grid rejects stale, failed, undated, future, expired and offline inventory', async()=>{
  for(const payload of [ {...fresh(1_000_000),stale:true}, {...fresh(1_000_000),ok:false}, {...fresh(1_000_000),refreshedAt:null}, {...fresh(1_060_000)}, {...fresh(900_000)}, {...fresh(1_000_000),models:[{...model,status:'offline'}]} ]){
    const f=fixture(payload);await settle();assert.equal(f.grid.children.length,0);assert.equal(f.fallback.hidden,false);
  }
});
test('inventory is requested only on viewport entry and polling is 60 seconds', async()=>{
  const f=fixture(fresh,{visible:false});await f.advance(180_000);assert.equal(f.calls(),0);
  f.enter(true);await settle();assert.equal(f.calls(),1);
  await f.advance(59_999);assert.equal(f.calls(),1);
  await f.advance(1);assert.equal(f.calls(),2);
});
test('healthy renewal preserves cards and emits no repeated loaded analytics',async()=>{
  const f=fixture(fresh,{latency:280});await f.advance(280);
  const card=f.grid.children[0];assert.ok(card);
  for(let i=0;i<3;i++){
    await f.advance(60_000);assert.equal(f.grid.children[0],card,'previous snapshot remains eligible during healthy revalidation');
    await f.advance(280);assert.equal(f.grid.children[0],card,'identical inventory keeps its DOM and images');
  }
  const loaded=f.transitions.findIndex(t=>t.count===1);
  assert.equal(f.transitions.slice(loaded).some(t=>t.count===0),false);
  assert.equal(f.calls(),4);
  assert.equal(f.analytics('live_models_loaded').length,1);
  assert.equal(f.analytics('live_models_unavailable').length,0);
});
test('failed revalidation clears still-valid images immediately without repeated unavailable events',async()=>{
  const f=fixture();await settle();f.fail();await f.advance(60_000);
  assert.equal(f.grid.children.length,0);assert.equal(f.fallback.hidden,false);
  await f.advance(120_000);
  assert.equal(f.analytics('live_models_unavailable').length,1);
});
test('snapshot validity is capped at 90 seconds and cannot be extended by cached responses',async()=>{
  const payload={...fresh(1_000_000),validUntil:new Date(1_999_999).toISOString()};
  const f=fixture(payload);await settle();await f.advance(89_999);assert.equal(f.grid.children.length,1);
  await f.advance(1);assert.equal(f.grid.children.length,0);assert.equal(f.fallback.hidden,false);
});
test('offscreen, hidden, unfocused and offline pages remove images and stop polling',async()=>{
  for(const state of ['offscreen','hidden','blur','offline']){
    const f=fixture();await settle();assert.equal(f.grid.children.length,1);
    if(state==='offscreen')f.enter(false);
    if(state==='hidden'){f.document.hidden=true;f.docEvents.visibilitychange();}
    if(state==='blur')f.events.blur();
    if(state==='offline'){f.navigator.onLine=false;f.events.offline();}
    const calls=f.calls();await f.advance(180_000);
    assert.equal(f.calls(),calls,state);assert.equal(f.grid.children.length,0,state);
    if(state==='offscreen')f.enter(true);
    if(state==='hidden'){f.document.hidden=false;f.docEvents.visibilitychange();}
    if(state==='blur')f.events.focus();
    if(state==='offline'){f.navigator.onLine=true;f.events.online();}
    await settle();assert.equal(f.grid.children.length,1,state);
  }
});
test('a response started before leaving the viewport cannot restore inactive images',async()=>{
  const f=fixture(fresh,{latency:200});f.enter(false);await f.advance(200);
  assert.equal(f.grid.children.length,0);assert.equal(f.calls(),1);assert.equal(f.analytics('live_models_loaded').length,0);
});
test('image-only card preserves tracked routing',async()=>{
  const f=fixture();await settle();const link=f.grid.children[0].children[0];const url=new URL(link.href);
  for(const key of ['userId','campaignId','creativeId','sourceId','p1','p2','targetDomain','path'])assert.ok(url.searchParams.get(key));
  assert.equal(url.searchParams.get('targetDomain'),'avcams.online');assert.equal(link.children[0].src,model.snapshotUrl);
});
test('an older shared snapshot revalidates at expiry without waiting another 60-second poll',async()=>{
  let refreshedAt=941_000;
  const f=fixture(now=>{
    if(now-refreshedAt>=60_000)refreshedAt=now;
    return {...fresh(refreshedAt)};
  },{latency:280});
  await f.advance(280);assert.equal(f.grid.children.length,1);
  await f.advance(30_720);assert.equal(f.grid.children.length,0,'90-second deadline still removes the older snapshot');
  assert.equal(f.calls(),2,'deadline initiates the necessary renewal before the regular poll');
  await f.advance(280);assert.equal(f.grid.children.length,1);
  const empty=f.transitions.find(t=>t.now===1_031_000&&t.count===0);
  const restored=f.transitions.find(t=>t.now>empty.now&&t.count===1);
  assert.equal(restored.now-empty.now,280,'only response latency, not another polling cycle, separates snapshots');
});
