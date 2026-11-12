import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyJoinEvidence, diagnoseFunnel, inspectConsentTrace } from '../attribution-funnel-diagnostics.mjs';
const memberId = 'su_offline_fixture_12345';
const clicked = Date.parse('2026-11-01T00:00:00Z');
const click = { memberId, occurredAt: clicked, pagePath: '/offline-fixture?private=never-log' };
test('consent traces fail closed before grant, after revocation, and for unknown consent', () => {
  const result = inspectConsentTrace([{ type:'first_party_click' },{type:'consent', analyticsStorage:'granted'},
    {type:'ga_event', name:'affiliate_click'}, {type:'first_party_click'}, {type:'consent',analyticsStorage:'denied'},
    {type:'analytics_storage_write'}, {type:'consent',analyticsStorage:'unknown'}, {type:'first_party_click'}]);
  assert.deepEqual(result.violations.map(v=>v.index),[0,5,7]);
  assert.equal(result.grantedGaEvents,1);
  assert.equal(result.productionAcceptance,'NOT_PROVEN_BY_OFFLINE_TRACE');
});
test('provider aliases, absent identity and invalid identity remain distinct without guessed mapping', () => {
  for (const alias of ['memberId','member_id','memberid']) assert.equal(classifyJoinEvidence({[alias]:memberId,receivedAt:clicked+1},[click]).classification,'MATCHED_EVIDENCE');
  assert.equal(classifyJoinEvidence({subId:memberId}).classification,'UNSUPPORTED_ID_ALIAS_REQUIRES_PROVIDER_CONTRACT');
  assert.equal(classifyJoinEvidence({}).classification,'MISSING_MEMBER_ID');
  assert.equal(classifyJoinEvidence({memberId:'private-invalid-id'}).classification,'INVALID_MEMBER_ID');
});
test('time and retention diagnoses require actual evidence; missing click cannot become historical success', () => {
  assert.equal(classifyJoinEvidence({memberId,receivedAt:clicked+31*86400000},[click]).classification,'OUTSIDE_LOCAL_RETENTION_WINDOW');
  assert.equal(classifyJoinEvidence({memberId,receivedAt:clicked-1},[click]).classification,'POSTBACK_BEFORE_CLICK');
  assert.equal(classifyJoinEvidence({memberId},[click]).classification,'TIME_WINDOW_UNKNOWN');
  assert.equal(classifyJoinEvidence({memberId,receivedAt:clicked},[],{instrumentationSince:clicked+1}).classification,'PRE_INSTRUMENTATION_EVIDENCE');
  assert.equal(classifyJoinEvidence({memberId,receivedAt:clicked},[]).classification,'CLICK_NOT_FOUND_CAUSE_UNKNOWN');
  assert.equal(classifyJoinEvidence({memberId,receivedAt:clicked},[click,click]).classification,'AMBIGUOUS_CLICK_RECORDS');
});
test('diagnostics expose no raw identifiers/source queries and do not invent currency or transaction IDs', () => {
  const d=classifyJoinEvidence({memberId,receivedAt:clicked+1,raw:'secret'},[click]);
  assert.equal(d.currency,'UNKNOWN'); assert.equal(d.sourcePageAvailable,true); assert.equal(d.transactionIdPresent,false);
  assert.ok(!JSON.stringify(d).includes(memberId)); assert.ok(!JSON.stringify(d).includes('private=')); assert.ok(!JSON.stringify(d).includes('secret'));
});
test('a predeploy settled GA4 window cannot prove postdeploy tag failure or reconcile cumulative attribution', () => {
  const d=diagnoseFunnel({tagDeployedAt:'2026-11-12T03:09:02Z',ga4TimeZone:'UTC',ga4:{startDate:'2026-10-12',endDate:'2026-11-11',rows:[{hostName:'blog.stripunion.com',sessions:4}],eventRows:[]},
    attribution:{totalClicks:45,totalPostbacks:15,matchedPostbacks:3,unmatchedPostbacks:12,diagnostics:{since:'2026-11-12T05:23:11Z',joinStatus:{matched:2}},revenueByCurrency:{UNKNOWN:224.25}}});
  assert.equal(d.ga4.coverage,'PRE_DEPLOYMENT_ONLY'); assert.equal(d.ga4.sites.main.sessions,0); assert.equal(d.ga4.sites.blog.sessions,4);
  assert.equal(d.attribution.newWindowUnmatched,0); assert.equal(d.attribution.unmatchedOutsideDiagnosticCoverage,12);
  assert.equal(d.attribution.legacyUnmatchedCause,'UNKNOWN_WITHOUT_EVENT_LEVEL_EVIDENCE'); assert.equal(d.attribution.comparableToGa4Period,false);
});
test('deployment-day timezone ambiguity and absent data are unknown rather than postdeploy acceptance', () => {
  assert.equal(diagnoseFunnel({tagDeployedAt:'2026-11-12T03:09:02Z',ga4TimeZone:'UTC',ga4:{endDate:'2026-11-12'},attribution:{}}).ga4.coverage,'DEPLOYMENT_DAY_TIMEZONE_UNRESOLVED');
  assert.equal(diagnoseFunnel({tagDeployedAt:'2026-11-12T03:09:02Z',ga4:{endDate:'2026-11-11'},attribution:{}}).ga4.coverage,'TIMEZONE_UNKNOWN');
  assert.equal(diagnoseFunnel({tagDeployedAt:'2026-11-12T03:09:02Z',ga4TimeZone:'America/Los_Angeles',ga4:{endDate:'2026-11-11'},attribution:{}}).ga4.coverage,'DEPLOYMENT_DAY_TIMEZONE_UNRESOLVED');
  assert.equal(diagnoseFunnel({ga4:{},attribution:{}}).ga4.coverage,'UNKNOWN');
  assert.equal(diagnoseFunnel({ga4:{},attribution:{}}).ga4.sites.main.sessions,null);
  assert.equal(diagnoseFunnel({ga4:{},attribution:{}}).ga4.sites.main.affiliateClicks,null);
  assert.equal(classifyJoinEvidence({memberId:'bad'},[{memberId:'also-bad',pagePath:'/private'}]).sourcePageAvailable,false);
});
