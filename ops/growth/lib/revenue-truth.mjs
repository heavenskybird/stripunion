// Aggregate business evidence only. Never creates clicks, joins, conversions or currency repairs.
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const sum = values => values.length ? values.reduce((n,v)=>n+v,0) : null;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
export const BUSINESS_CURRENCY = { currency:'USD', evidence:'OWNER_CONFIRMED_BUSINESS_SETTLEMENT', source:'https://github.com/heavenskybird/stripunion/issues/174#issuecomment-6880074915', assertedOn:'2026-11-14', changesHistoricalCurrency:false };
export function amountBuckets(input = {}) {
  const currencies = Object.entries(input).filter(([currency,value])=>/^[A-Z]{3,12}$/.test(currency) && numeric(value)!==null);
  return { reportedUsd: currencies.some(([c])=>c==='USD') ? currencies.find(([c])=>c==='USD')[1] : null,
    unknownCurrency: currencies.some(([c])=>c==='UNKNOWN') ? currencies.find(([c])=>c==='UNKNOWN')[1] : null,
    otherCurrencies:Object.fromEntries(currencies.filter(([c])=>!['USD','UNKNOWN'].includes(c))),
    confirmation:'UNVERIFIED_POSTBACK_AMOUNT',
    reason:'Receiver accepts revenue/payout/commission/earnings/amount aliases; monetary semantics, transaction identity and provider settlement are not established by this summary.' };
}
export function unmatchedEvidence(attribution = {}) {
  const total=count(attribution.totalPostbacks), unmatched=count(attribution.unmatchedPostbacks), diagnostic=attribution.diagnostics;
  const allowed=['missing_member_id','invalid_member_id','click_not_found'];
  const knownCauses=Object.fromEntries(allowed.filter(k=>count(diagnostic?.joinStatus?.[k])!==null).map(k=>[k,diagnostic.joinStatus[k]]));
  const knownTotal=Object.values(knownCauses).reduce((n,v)=>n+v,0);
  const consistent=unmatched!==null && knownTotal<=unmatched && (count(diagnostic?.observedPostbacks)===null || diagnostic.observedPostbacks<=total);
  return {totalPostbacks:total,totalUnmatched:unmatched,diagnosticSince:diagnostic?.since || null,diagnosticObservedPostbacks:count(diagnostic?.observedPostbacks),
    verifiedCauseCounts:knownCauses,unexplainedUnmatched:consistent ? unmatched-knownTotal : null,
    status:!consistent?'COUNTER_SCOPE_UNKNOWN':unmatched===knownTotal?'DIAGNOSTIC_CAUSES_ACCOUNTED_FOR':'HISTORICAL_CAUSES_UNPROVEN',
    explanation:'Only new-window diagnostic counters establish causes. Missing consented clicks, expiry, missing IDs or legacy instrumentation are hypotheses for uncovered events, never retroactive explanations. No raw event/list endpoint is exposed by the deployed summary API.'};
}
function approvedStatement(statement,now) {
  if(statement?.kind!=='PROVIDER_SCOPED_COMMISSION_STATEMENT' || statement.currency!=='USD' || !['approved','paid'].includes(statement.status) ||
    !validDate(statement.startDate)||!validDate(statement.endDate)||statement.endDate<statement.startDate || numeric(statement.netCommissionUsd)===null ||
    !/^[a-f0-9]{64}$/.test(statement.evidenceSha256 || '') || statement.reviewedBy!=='heavenskybird' || (!Number.isFinite(Date.parse(statement.reviewedAt)) || Date.parse(statement.reviewedAt)>now)) return false;
  try {return ['stripcash.com','www.stripcash.com','api.stripcash.com'].includes(new URL(statement.sourceUrl).hostname) && new URL(statement.sourceUrl).protocol==='https:';} catch {return false;}
}
function ageStatus(snapshot, now) {
  const age=now-Date.parse(snapshot?.collectedAt);
  return !Number.isFinite(age)||age<0?'UNKNOWN':age>72*3600000?'STALE':'FRESH';
}
export function buildRevenueTruth({attribution=null,partner=null,financialStatements=[],pageRoutes={},now=Date.now()}={}) {
  const approved=financialStatements.filter(statement=>approvedStatement(statement,now));
  // Do not sum overlapping statements or payout balances with period earnings.
  const statement=approved.length===1 ? approved[0] : null;
  const pages=Object.entries(attribution?.byP1 || {}).filter(([key])=>/^[a-z0-9_-]{1,160}$/i.test(key)).map(([pageKey,bucket])=>({
    pageKey,surface:/^\/[a-z0-9/-]*$/.test(pageRoutes[pageKey] || '')?'https://stripunion.com'+pageRoutes[pageKey]:null,source:'FIRST_PARTY_JOINED_PAGE_KEY',scope:'CUMULATIVE_SUMMARY_WINDOW_UNKNOWN',collectedAt:attribution.collectedAt || null,
    clicks:count(bucket.clicks),matchedPostbackEvents:count(bucket.matchedPostbacks),
    joinedRegistrationEvents:count(bucket.eventCounts?.member_registration),joinedModelRegistrationEvents:count(bucket.eventCounts?.model_registration),
    joinedFirstPurchaseEvents:count(bucket.eventCounts?.first_purchase),joinedPurchaseEvents:count(bucket.eventCounts?.purchase),
    joinedRefundEvents:count(bucket.eventCounts?.refund),reportedAmounts:amountBuckets(bucket.revenueByCurrency),
    confirmedUsdCommission:null,qualifiedUniqueConversions:null,
    limitation:'Page keys are retained verbatim; no fuzzy alias/URL mapping or unique-buyer inference. Event types are not summed into unique conversions. Attribution does not establish provider-qualified or paid commission.'
  }));
  return {version:1,businessCurrency:BUSINESS_CURRENCY,
    sources:{partner:{collectedAt:partner?.collectedAt || null,freshness:ageStatus(partner,now),scope:partner?.reportScope || 'UNKNOWN',period:null,periodStatus:'UNKNOWN_DEFAULT_SCOPE'},
      attribution:{collectedAt:attribution?.collectedAt || null,updatedAt:attribution?.updatedAt || null,freshness:ageStatus(attribution,now),scope:attribution?.reportScope || 'UNKNOWN',period:null,periodStatus:'CUMULATIVE_NOT_A_DATED_COHORT'}},
    confirmedUsd:{amount:statement?.netCommissionUsd ?? null,status:statement?'REVIEWED_SCOPED_PROVIDER_STATEMENT':'UNKNOWN_NO_SCOPED_STATEMENT',period:statement?{startDate:statement.startDate,endDate:statement.endDate}:null,
      acceptedStatementCount:approved.length,evidenceSha256:statement?.evidenceSha256 || null,paid:statement?.status==='paid',attributedToPages:false},
    pending:{partnerReportedCommission: numeric(partner?.metrics?.totalEarnings),currency:'USD',currencyEvidence:'BUSINESS_CURRENCY_OWNER_ASSERTION',
      partnerMetric:'totalEarnings',period:null,status:'PROVIDER_METRIC_SCOPE_UNVERIFIED',
      postbackAmounts:amountBuckets(attribution?.revenueByCurrency),
      reason:'Partner default aggregate, dashboard Today, current balance, payout due and cumulative postbacks are separate scopes; never add them or claim same-window EPC/ROI.'},
    partnerFunnel:{clicks:count(partner?.metrics?.clicks),registrations:count(partner?.metrics?.signup),verifiedRegistrations:count(partner?.metrics?.verifiedSignup),
      firstPurchasers:count(partner?.metrics?.newCustomersCount),purchaseEvents:count(partner?.metrics?.purchasesCount),modelReferralEarnings:numeric(partner?.metrics?.modelsReferralEarnings),affiliateReferralEarnings:numeric(partner?.metrics?.webmasterReferralEarnings),
      conversionRate:null,epcUsd:null,reason:'No authenticated matched time/geo/source/SubID window is established by the default endpoint. Missing metrics remain null.'},
    unmatched:attribution?unmatchedEvidence(attribution):{status:'SOURCE_UNAVAILABLE'},pages,
    windowComparison:{status:'NOT_COMPARABLE',partner:'UNKNOWN_DEFAULT_SCOPE',attribution:'CUMULATIVE_WINDOW_UNKNOWN',ga4:'CONSENTED_ANALYTICS_DIFFERENT_POPULATION',
      permittedMetrics:['same-scope 7/28-day provider registrations, first purchasers and approved USD commissions after official scoped data is available'],
      prohibitedClaims:['GA4 sessions equal provider clicks','224.25 UNKNOWN equals confirmed USD','206 clicks/0 today proves a specific traffic-quality cause','Payout-due card equals today revenue']},
    requiredEvidence:['Authenticated provider same-window 7/28-day report with timezone, geo/source/SubID and approved net commission USD',
      'Provider Payout History status/period to separate earned commission, current balance and paid settlement',
      'Explicit postback amount/currency/transaction macro semantics before treating receiver amounts as commission'],
    productionWrites:0,syntheticConversions:0};
}
export function revenueBrainDecisions(truth) {
  const rows=[{id:'revenue:financial-scope',kind:'revenue',action:'HOLD',priority:84,eligible:false,subject:'confirmed USD affiliate commission',surface:null,risk:'medium',confidence:'source-observed',
    rationale:'Reconcile authenticated provider periods and commission semantics before revenue-based expansion; do not optimize fabricated EPC.',evidence:{confirmedUsd:truth.confirmedUsd,pending:truth.pending,windowComparison:truth.windowComparison}}];
  if(truth.unmatched.unexplainedUnmatched>0)rows.push({id:'revenue:unmatched',kind:'revenue',action:'HOLD',priority:80,eligible:false,subject:'unexplained historical postbacks',surface:null,risk:'medium',confidence:'observed-unknown',rationale:'Retain unmatched history and request source evidence; deployed diagnostics do not explain uncovered historical events.',evidence:truth.unmatched});
  for(const page of truth.pages) {
    const conversions=[page.joinedRegistrationEvents,page.joinedModelRegistrationEvents,page.joinedFirstPurchaseEvents,page.joinedPurchaseEvents].filter(v=>v!==null);
    const signals=sum(conversions) || 0;
    const joinedEvidenceConsistent=page.matchedPostbackEvents!==null && signals<=page.matchedPostbackEvents;
    rows.push({id:'revenue:page:'+page.pageKey,kind:'page_revenue',action:signals>0?'UPDATE':'HOLD',priority:signals>0?74:42,eligible:signals>0&&Boolean(page.surface)&&joinedEvidenceConsistent&&truth.sources.attribution.freshness==='FRESH',
      subject:page.pageKey,surface:page.surface,risk:'low',confidence:signals>0?'joined-event-observed':'insufficient',monetizationRoute:null,
      rationale:signals>0?'Preserve and review this existing page-key funnel with joined partner events; do not create a duplicate page or claim paid revenue. URL mapping and commercial fit require review.':'Clicks alone are not a qualified conversion or revenue winner; preserve the page key and collect same-window evidence.',evidence:page});
  }
  return rows;
}
export function sanitizeAttributionSummary(summary,collectedAt=new Date().toISOString()) {
  if(!summary||typeof summary!=='object')throw Error('ATTRIBUTION_SUMMARY_INVALID');
  const result={collectedAt,reportScope:'first-party AVCams cumulative click/postback summary',updatedAt:Number.isFinite(Date.parse(summary.updatedAt))?summary.updatedAt:null};
  for(const key of ['totalClicks','totalPostbacks','matchedPostbacks','unmatchedPostbacks','duplicatePostbacks']) {
    if(count(summary[key])===null)throw Error('ATTRIBUTION_COUNTER_INVALID');result[key]=summary[key];
  }
  const currencies=input=>Object.fromEntries(Object.entries(input || {}).filter(([k,v])=>/^[A-Z]{3,12}$/.test(k)&&numeric(v)!==null));
  const events=input=>Object.fromEntries(Object.entries(input || {}).filter(([k,v])=>['member_registration','member_verification','model_registration','age_verification','first_purchase','purchase','rebill','refund','unknown'].includes(k)&&count(v)!==null));
  result.eventCounts=events(summary.eventCounts);result.revenueByCurrency=currencies(summary.revenueByCurrency);
  const raw=summary.diagnostics || {};
  result.diagnostics={since:Number.isFinite(Date.parse(raw.since))?raw.since:null,observedPostbacks:count(raw.observedPostbacks),
    joinStatus:Object.fromEntries(Object.entries(raw.joinStatus || {}).filter(([k,v])=>['matched','missing_member_id','invalid_member_id','click_not_found'].includes(k)&&count(v)!==null)),
    unknownCurrency:count(raw.unknownCurrency),missingTransactionId:count(raw.missingTransactionId)};
  result.byP1=Object.fromEntries(Object.entries(summary.byP1 || {}).filter(([key])=>/^[a-z0-9_-]{1,160}$/i.test(key)).slice(0,5000).map(([key,b])=>[key,{clicks:count(b.clicks),postbacks:count(b.postbacks),matchedPostbacks:count(b.matchedPostbacks),eventCounts:events(b.eventCounts),revenueByCurrency:currencies(b.revenueByCurrency)}]));
  return result;
}
