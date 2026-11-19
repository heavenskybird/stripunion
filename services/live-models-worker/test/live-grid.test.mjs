import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../../src/components/LiveModelsGrid.astro', import.meta.url),'utf8').match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
function fixture(payload) {
  class Element {
    constructor() { this.dataset={}; this.children=[]; this.hidden=true; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children=items; }
    setAttribute() {}
  }
  const root=new Element(), grid=new Element(), status=new Element(), fallback=new Element();
  root.dataset={endpoint:'https://api.example.invalid/models',userId:'fixture',trackingBase:'https://go.whitetrafsa.com/'};
  root.querySelector=s=>({'[data-live-grid]':grid,'[data-live-status]':status,'[data-live-fallback]':fallback})[s];
  const events={}, docEvents={}, timers=new Map();let poll, next=1, fail=false, fetchCalls=0;
  const document={hidden:false,querySelector:()=>root,createElement:()=>new Element(),addEventListener:(n,f)=>docEvents[n]=f};
  const window={location:{pathname:'/avcams'},addEventListener:(n,f)=>events[n]=f};
  vm.runInNewContext(source,{HTMLElement:Element,document,window,URL,AbortSignal,Date,
    fetch:async()=>{fetchCalls++;if(fail)throw Error('network');return {ok:true,json:async()=>typeof payload === 'function' ? payload() : payload};},
    setInterval:f=>poll=f,setTimeout:f=>{const id=next++;timers.set(id,f);return id;},clearTimeout:id=>timers.delete(id)});
  return {grid,fallback,events,docEvents,document,timers,poll:()=>poll(),calls:()=>fetchCalls,fail:()=>fail=true};
}
const model={id:1,username:'fixture',status:'public',snapshotUrl:'https://cdn.example.invalid/image.jpg'};
const fresh=()=>({ok:true,stale:false,refreshedAt:new Date().toISOString(),models:[model]});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('grid rejects stale, failed, undated, future, expired and offline inventory', async()=>{
  for(const payload of [ {...fresh(),stale:true}, {...fresh(),ok:false}, {...fresh(),refreshedAt:null}, {...fresh(),refreshedAt:new Date(Date.now()+60_000).toISOString()}, {...fresh(),refreshedAt:new Date(Date.now()-20_000).toISOString()}, {...fresh(),models:[{...model,status:'offline'}]} ]){
    const f=fixture(payload);await settle();assert.equal(f.grid.children.length,0);assert.equal(f.fallback.hidden,false);
  }
});
test('grid retains image-only tracked routing and clears on expiry, offline, failure and hidden tab',async()=>{
  for(const trigger of ['expiry','offline','failure','hidden']){
    const f=fixture(fresh());await settle();assert.equal(f.grid.children.length,1);
    const link=f.grid.children[0].children[0];const url=new URL(link.href);
    for(const key of ['userId','campaignId','creativeId','sourceId','p1','p2','targetDomain','path'])assert.ok(url.searchParams.get(key));
    assert.equal(url.searchParams.get('targetDomain'),'avcams.online');
    assert.equal(link.children[0].src,model.snapshotUrl);
    if(trigger==='expiry') [...f.timers.values()][0]();
    if(trigger==='offline')f.events.offline();
    if(trigger==='failure'){f.fail();await f.poll();}
    if(trigger==='hidden'){f.document.hidden=true;f.docEvents.visibilitychange();}
    assert.equal(f.grid.children.length,0);assert.equal(f.fallback.hidden,false);
  }
});

test('snapshot expiry revalidates immediately when the preceding poll reused cached inventory', async t => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  let refreshedAt = now;
  let upstreamCalls = 0;
  const f = fixture(() => {
    // Simulate the real ten-second Worker cache with its initial refresh offset
    // from the browser interval. The 5s/10s polls both reuse the first snapshot.
    if (!upstreamCalls || now - refreshedAt >= 10_000) {
      refreshedAt = now;
      upstreamCalls++;
    }
    return {ok:true, stale:false, refreshedAt:new Date(refreshedAt).toISOString(),
      validUntil:new Date(refreshedAt + 10_000).toISOString(), models:[model]};
  });
  await settle();
  now += 4_800;
  await f.poll();
  now += 5_000;
  await f.poll();
  assert.equal(upstreamCalls, 1);
  const callsBeforeExpiry = f.calls();
  now += 200;
  [...f.timers.values()][0]();
  assert.equal(f.grid.children.length, 0, 'expired cards are still removed immediately');
  await settle();
  assert.equal(f.calls(), callsBeforeExpiry + 1, 'expiry requests a new snapshot without waiting five seconds');
  assert.equal(upstreamCalls, 2);
  assert.equal(f.grid.children.length, 1);
  assert.equal(f.fallback.hidden, true);
});
