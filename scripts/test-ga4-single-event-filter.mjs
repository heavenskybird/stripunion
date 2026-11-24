import test from 'node:test';import assert from 'node:assert/strict';import {diagnosticRequest} from './ga4-single-event-filter.mjs';
const url='https://www.google-analytics.com/g/collect?v=2&tid=G-K57BRX69X1';
test('retains exact native diagnostic line and removes engagement/purchase events',()=>{
 const native='en=recovery_consent_check&ep.release_sha=fixture&_dbg=1';
 assert.deepEqual(diagnosticRequest(url,'en=user_engagement&_et=100\n'+native+'\nen=purchase&value=9'),{postData:native,eventCount:1});
});
test('only one exact diagnostic can pass; ambiguous or foreign transport is rejected',()=>{
 for(const [u,b] of [[url,'en=page_view'],[url,'en=recovery_consent_check\nen=recovery_consent_check'],[url+'&en=page_view','en=recovery_consent_check'],[url.replace('G-K57BRX69X1','G-OTHER'),'en=recovery_consent_check'],['https://example.org/g/collect?tid=G-K57BRX69X1','en=recovery_consent_check']])assert.equal(diagnosticRequest(u,b),null);
 assert.deepEqual(diagnosticRequest(url+'&en=recovery_consent_check',''),{postData:'',eventCount:1});
});
