import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRevenueTruth,unmatchedEvidence,revenueBrainDecisions,sanitizeAttributionSummary} from '../../ops/growth/lib/revenue-truth.mjs';
import {normalizeStripCashPayload} from '../../ops/seo-data-layer/src/collectors/stripcash.mjs';
const now=Date.parse('2026-11-15T06:00:00Z');
const attribution={collectedAt:'2026-11-15T05:00:00Z',updatedAt:'2026-11-14T03:21:30Z',totalClicks:50,totalPostbacks:15,matchedPostbacks:3,unmatchedPostbacks:12,duplicatePostbacks:0,
  revenueByCurrency:{UNKNOWN:224.25},eventCounts:{purchase:7,member_registration:3},diagnostics:{since:'2026-11-12T05:23:11Z',observedPostbacks:2,joinStatus:{matched:2},unknownCurrency:2,missingTransactionId:2},
  byP1:{'stripchat-alternatives':{clicks:11,postbacks:2,matchedPostbacks:2,eventCounts:{member_registration:1,age_verification:1},revenueByCurrency:{}},'stripchat_alternatives':{clicks:6,postbacks:1,matchedPostbacks:1,eventCounts:{age_verification:1},revenueByCurrency:{}}}};
const partner={collectedAt:'2026-11-15T05:00:00Z',reportScope:'API default aggregate; dates unknown',metrics:{signup:1,verifiedSignup:0,newCustomersCount:0,purchasesCount:0,totalEarnings:0,modelsReferralEarnings:0,webmasterReferralEarnings:0}};
const statement={kind:'PROVIDER_SCOPED_COMMISSION_STATEMENT',currency:'USD',status:'paid',startDate:'2026-10-01',endDate:'2026-10-31',netCommissionUsd:12.34,evidenceSha256:'a'.repeat(64),reviewedBy:'heavenskybird',reviewedAt:'2026-11-15T05:00:00Z',sourceUrl:'https://stripcash.com/statistics'};
test('business USD never relabels UNKNOWN postbacks or confirms a default-scope API zero',()=>{
 const before=JSON.stringify(attribution);const r=buildRevenueTruth({attribution,partner,now});
 assert.equal(r.businessCurrency.currency,'USD');assert.equal(r.businessCurrency.changesHistoricalCurrency,false);
 assert.equal(r.confirmedUsd.amount,null);assert.equal(r.pending.partnerReportedCommission,0);assert.equal(r.pending.postbackAmounts.unknownCurrency,224.25);assert.equal(r.pending.postbackAmounts.reportedUsd,null);
 assert.equal(r.partnerFunnel.clicks,null);assert.equal(r.partnerFunnel.conversionRate,null);assert.equal(r.partnerFunnel.epcUsd,null);
 assert.equal(JSON.stringify(attribution),before);
});
test('12 historical unmatched remain unexplained when diagnostics cover only two matched events',()=>{
 const r=unmatchedEvidence(attribution);assert.equal(r.totalUnmatched,12);assert.equal(r.diagnosticObservedPostbacks,2);assert.deepEqual(r.verifiedCauseCounts,{});assert.equal(r.unexplainedUnmatched,12);assert.equal(r.status,'HISTORICAL_CAUSES_UNPROVEN');
});
test('only actual new diagnostic causes reduce unexplained count; counter mismatch holds',()=>{
 const a={...attribution,diagnostics:{observedPostbacks:5,joinStatus:{matched:2,missing_member_id:2,click_not_found:1}}};
 assert.equal(unmatchedEvidence(a).unexplainedUnmatched,9);
 const b={...attribution,diagnostics:{observedPostbacks:16,joinStatus:{missing_member_id:15}}};
 assert.equal(unmatchedEvidence(b).unexplainedUnmatched,null);assert.equal(unmatchedEvidence(b).status,'COUNTER_SCOPE_UNKNOWN');
});
test('confirmed commission requires a single reviewed scoped provider statement, never a payout balance',()=>{
 assert.equal(buildRevenueTruth({financialStatements:[statement],now}).confirmedUsd.amount,12.34);
 for(const patch of [{currency:'UNKNOWN'},{status:'due'},{reviewedBy:'automatic'},{startDate:'2026-02-31'},{reviewedAt:'2027-01-01'},{sourceUrl:'https://evil.example'},{evidenceSha256:null}])assert.equal(buildRevenueTruth({financialStatements:[{...statement,...patch}],now}).confirmedUsd.amount,null);
 assert.equal(buildRevenueTruth({financialStatements:[statement,statement],now}).confirmedUsd.amount,null);
});
test('USD postback amounts remain pending because receiver amount aliases do not establish net commission',()=>{
 const r=buildRevenueTruth({attribution:{...attribution,revenueByCurrency:{USD:12,UNKNOWN:4}},partner,now});assert.equal(r.pending.postbackAmounts.reportedUsd,12);assert.equal(r.pending.postbackAmounts.confirmation,'UNVERIFIED_POSTBACK_AMOUNT');assert.equal(r.confirmedUsd.amount,null);
});
test('page-key conversions remain joined events, not unique qualified buyers or paid page revenue',()=>{
 const r=buildRevenueTruth({attribution,partner,pageRoutes:{'stripchat-alternatives':'/stripchat-alternatives/'},now});assert.equal(r.pages.length,2);assert(r.pages.some(p=>p.pageKey==='stripchat_alternatives'));assert(r.pages.some(p=>p.pageKey==='stripchat-alternatives'));
 const p=r.pages.find(p=>p.pageKey==='stripchat-alternatives');assert.equal(p.joinedRegistrationEvents,1);assert.equal(p.joinedPurchaseEvents,null);assert.equal(p.confirmedUsdCommission,null);assert.equal(p.qualifiedUniqueConversions,null);
 const d=revenueBrainDecisions(r);const decision=d.find(d=>d.id==='revenue:page:stripchat-alternatives');assert.equal(decision.action,'UPDATE');assert.equal(decision.eligible,true);assert.equal(decision.surface,'https://stripunion.com/stripchat-alternatives/');assert.equal(d.find(d=>d.id==='revenue:page:stripchat_alternatives').eligible,false);assert(d.some(d=>d.id==='revenue:financial-scope'&&d.eligible===false));
});
test('stale attribution or impossible joined counters cannot trigger eligible updates',()=>{
 const stale=buildRevenueTruth({attribution:{...attribution,collectedAt:'2026-10-01'},now});assert(revenueBrainDecisions(stale).every(d=>!d.eligible));
 const impossible=buildRevenueTruth({attribution:{...attribution,byP1:{x:{matchedPostbacks:0,eventCounts:{purchase:3}}}},now});assert(revenueBrainDecisions(impossible).every(d=>!d.eligible));
});
test('missing source stays unknown and does not become zero confirmed revenue',()=>{
 const r=buildRevenueTruth({now});assert.equal(r.confirmedUsd.amount,null);assert.equal(r.pending.partnerReportedCommission,null);assert.equal(r.partnerFunnel.registrations,null);assert.equal(r.sources.partner.freshness,'UNKNOWN');assert.deepEqual(r.pages,[]);
});
test('summary projection excludes private identities and unknown fields',()=>{
 const sanitized=sanitizeAttributionSummary({...attribution,email:'private@example.com',memberId:'su_123456789',byP1:{...attribution.byP1,'private@example.com':{clicks:1}},diagnostics:{...attribution.diagnostics,rawEvents:[{memberId:'secret'}]}});
 assert(!JSON.stringify(sanitized).includes('@'));assert(!JSON.stringify(sanitized).includes('memberId'));assert(!JSON.stringify(sanitized).includes('rawEvents'));assert.equal(sanitized.unmatchedPostbacks,12);
});
test('StripCash normalizer does not turn missing/null monetary fields into zero or claim a date',()=>{
 const payload={statistics:{status:'success',data:{data:[{signup:1,verifiedSignup:0,purchasesCount:0,purchaseEarnings:0,totalEarnings:0}]}}};
 const r=normalizeStripCashPayload(payload);assert.equal(r.businessBaseCurrency,'USD');assert.equal(r.reportingPeriod,null);assert.equal(r.metrics.totalEarnings,0);
 assert.throws(()=>normalizeStripCashPayload({statistics:{data:{data:[{...payload.statistics.data.data[0],totalEarnings:null}]}}}),/reported numeric/);
});
