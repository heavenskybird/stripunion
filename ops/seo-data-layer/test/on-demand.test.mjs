import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuery,gscFilters,ga4Filter,safeText,safePath,chunks,aggregateSearch,intent,decisions} from '../src/lib/on-demand-query.mjs';
import {readGscWindow,queryAnalytics,requestBudget,bingContext,compactReport} from '../src/lib/on-demand-engine.mjs';
const now=Date.parse('2026-11-14T12:00:00Z');
const query = changes=>parseQuery(JSON.stringify(changes || {}),now);
const window={startDate:'2026-10-15',endDate:'2026-11-11'};
function gsc({fail=false,full=false}={}) { return {searchanalytics:{async query({requestBody:r}) {
  if(fail)throw Object.assign(Error('SECRET_PRIVATE_KEY'),{code:403});
  assert.equal(r.dataState,'final');assert.equal(r.type,'web');
  const row={keys:r.dimensions.length===1?['2026-11-01']:['2026-11-01','chaturbate alternatives','https://stripunion.com/chaturbate-alternatives/','usa','DESKTOP'],clicks:1,impressions:100,ctr:.01,position:9};
  return {data:{responseAggregationType:r.aggregationType,rows:full&&r.dimensions.length>1?Array(25000).fill(row):[row]}};
}}}; }
function ga4() { return {async runReport(r) {
  assert.equal(r.property,'properties/530171093');assert.equal(r.returnPropertyQuota,true);
  const values={date:'20261101',hostName:'stripunion.com',landingPage:'/chaturbate-alternatives/',sessionSourceMedium:'x / social',countryId:'US',deviceCategory:'desktop',sessionCampaignName:'bf20261113',sessionManualAdContent:'p01'};
  const value={sessions:'20',engagedSessions:'2',engagementRate:'.1',userEngagementDuration:'45',eventCount:'3'};
  return [{dimensionHeaders:r.dimensions,metricHeaders:r.metrics,rows:[{dimensionValues:r.dimensions.map(d=>({value:values[d.name]})),metricValues:r.metrics.map(m=>({value:value[m.name]}))}],rowCount:1,metadata:{timeZone:'Asia/Singapore',subjectToThresholding:true,samplingMetadatas:[{samplesReadCount:'9',samplingSpaceSize:'10'}]},propertyQuota:{tokensPerHour:{consumed:5,remaining:39995}}}];
}}; }
test('inclusive presets, equal prior windows and long GSC retention',()=>{
  for(const days of [7,28,90,365,480]){const q=query({days});assert.equal((Date.parse(q.endDate)-Date.parse(q.startDate))/86400000+1,days);assert.equal((Date.parse(q.previous.endDate)-Date.parse(q.previous.startDate))/86400000+1,days);}
  assert.equal(query({days:480}).gscPreviousAvailable,false);
  assert.throws(()=>query({startDate:'2020-01-01',endDate:'2020-01-03'}),/16_MONTH/);
  assert.equal(query().endDate,'2026-11-11');
  assert.equal(query({startDate:'2026-11-01',endDate:'2026-11-05'}).days,5);
});
test('typed allowlists reject arbitrary requests, credentials, dates and unsafe page filters',()=>{
  for(const q of [{property:'other'},{property:'__proto__'},{propertyId:'999'},{dimensions:['userId']},{days:481},{endDate:'2026-11-14'},{startDate:'2026-11-12',endDate:'2026-11-01'},{keyword:'user@example.com'},{keyword:'token=secret'},{page:'//evil.com'},{page:'/x?email=private'},{hostname:'evil.com'},{countryGsc:'US'},{countryGa4:'usa'},{device:'console'},{property:'blog',hostname:'stripunion.com'}])assert.throws(()=>query(q));
});
test('filters are server-side with explicit source, country and landing semantics',()=>{
  const q=query({keyword:'Stripchat',page:'/stripchat-app/',countryGsc:'usa',countryGa4:'US',device:'mobile',sourceMedium:'x / social',campaign:'bf20261113',adContent:'p01',hostname:'stripunion.com'});
  const gs=gscFilters(q).dimensionFilterGroups[0].filters;
  assert.equal(gs.find(f=>f.dimension==='query').operator,'contains');
  assert(!gs.some(f=>f.expression==='x / social'));
  const ga=ga4Filter(q,true).andGroup.expressions.map(e=>e.filter);
  assert.equal(ga.find(f=>f.fieldName==='landingPage').stringFilter.matchType,'EXACT');
  assert.equal(ga.find(f=>f.fieldName==='eventName').stringFilter.value,'affiliate_click');
  assert(!ga.some(f=>f.stringFilter?.value==='Stripchat'));
  assert.deepEqual(query({property:'blog'}).ga4Hosts,['blog.stripunion.com']);
});
test('privacy removes query strings, emails, phone IDs and account URLs',()=>{
  assert.equal(safePath('https://stripunion.com/stripchat/?email=a%40b.com&token=secret'),'https://stripunion.com/stripchat/');
  for(const v of ['user@example.com','123-456-7890','abcdefabcdefabcdefabcdef'])assert.equal(safeText(v),'[REDACTED]');
  assert.equal(safePath('/users/jane'),'[REDACTED]');
  assert.equal(safePath('/profile%40foo'),'[REDACTED]');
});
test('GSC chunks and pagination are bounded, preserve aggregation, never claim all queries',async()=>{
  assert.equal(chunks({startDate:'2026-01-01',endDate:'2026-04-01'}).length,3);
  const result=await readGscWindow(gsc(),query(),window,requestBudget());
  assert.equal(result.dailyAggregation,'byProperty');assert.equal(result.detail.populationComplete,false);assert.equal(result.detail.paginationComplete,true);
  const capped=await readGscWindow(gsc({full:true}),query(),window,requestBudget());
  assert.equal(capped.detail.rows.length,100000);assert.equal(capped.detail.paginationComplete,false);
});
test('actual report preserves GA4 quota/threshold/sampling, UTM and independent totals',async()=>{
  const result=await queryAnalytics({q:query(),gscClient:gsc(),ga4Client:ga4(),propertyInfo:{timeZone:'Asia/Singapore'}});
  assert.equal(result.status,'READY');assert.equal(result.ga4.current.totals.rows[0].sessions,20);
  assert.equal(result.ga4.current.landing.rows[0].sessionManualAdContent,'p01');
  assert.equal(result.ga4.current.landing.metadata[0].subjectToThresholding,true);
  assert.equal(result.ga4.current.landing.metadata[0].propertyQuota.tokensPerHour.remaining,39995);
  assert.equal(result.ga4.current.affiliate.rows[0].eventCount,3);
  assert.equal(result.ga4.current.landing.rows[0].date,'20261101');
  assert.equal(result.ga4.current.landing.rows[0].sessionCampaignName,'bf20261113');
  assert.equal(result.ga4.current.daily.metadata[0].timeZone,'Asia/Singapore');
  assert(result.decisions.some(d=>d.action==='UPDATE_EXISTING'));
  assert.equal(compactReport(result).productionWrites,0);
});
test('one provider failure cannot delete another provider result or leak errors',async()=>{
  const result=await queryAnalytics({q:query(),gscClient:gsc({fail:true}),ga4Client:ga4()});
  assert.equal(result.status,'PARTIAL');assert.equal(result.gsc.current.error,'PROVIDER_AUTH_OR_QUOTA_403');assert.equal(result.ga4.status,'ok');
  assert(!JSON.stringify(result).includes('SECRET_PRIVATE_KEY'));
});
test('sources selection never queries unrequested provider; long previous GSC is unavailable',async()=>{
  const result=await queryAnalytics({q:query({sources:'gsc',days:480}),gscClient:gsc(),ga4Client:{runReport(){throw Error('must not call');}}});
  assert.equal(result.ga4.status,'NOT_REQUESTED');assert.equal(result.gsc.previous.status,'UNAVAILABLE');assert.equal(result.status,'READY');
});
test('popular brands retain separate intents and low CTR decision updates existing URL',()=>{
  assert.deepEqual(intent('Stripchat app'),{brand:'stripchat',intent:'mobile'});
  assert.deepEqual(intent('Stripchat alternative'),{brand:'stripchat',intent:'comparison'});
  assert.equal(intent('LiveJasmin review').brand,'livejasmin');assert.equal(intent('Chaturbate prices').intent,'pricing');
  const d=decisions({current:{detail:{rows:[{query:'stripchat alternatives',page:'https://stripunion.com/stripchat-alternatives/',impressions:80,clicks:0,position:9}],paginationComplete:true}}},null);
  assert.equal(d[0].action,'UPDATE_EXISTING');assert.equal(d[0].trend,'UNKNOWN');
  assert.equal(aggregateSearch([{clicks:2,impressions:10,position:5},{clicks:0,impressions:30,position:15}]).position,12.5);
});
test('Bing is dated context, never fabricated matching-window data',()=>{
  const result=bingContext({collectedAt:'2026-11-14',sites:[{site:'stripunion.com',methodStatus:{GetCrawlIssues:'ok'},crawlIssues:[],crawlStats:[{Date:'2026-11-09',CrawlErrors:5}],queryStats:[{Query:'stripchat',Date:'2026-11-01',Clicks:1,Impressions:5}]}]},query());
  assert.equal(result.status,'STORED_PROVIDER_CONTEXT_ONLY');assert.equal(result.crawl.providerDataAsOf,'2026-11-09T00:00:00.000Z');assert(result.filtersNotAvailable.includes('country'));
});
test('local request budget fails closed before extra API work',async()=>{
  const budget=requestBudget(1);let calls=0;await budget.call(()=>calls++);await assert.rejects(()=>budget.call(()=>calls++),/REQUEST_BUDGET/);assert.equal(calls,1);
});
