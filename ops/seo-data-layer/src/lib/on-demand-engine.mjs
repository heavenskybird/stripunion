import { chunks, aggregateSearch, gscFilters, ga4Filter, sanitizeRows, decisions, intent, safeText, hash } from './on-demand-query.mjs';
import { normalizeGa4 } from './ga4-reports.mjs';
import { bingCrawlEvidence, bingDate } from './bing-crawl-evidence.mjs';
export function errorClass(error) {
  const code = Number(error?.response?.status || error?.code);
  return [401,403,429].includes(code) ? 'PROVIDER_AUTH_OR_QUOTA_' + code : [3,400].includes(code) ? 'PROVIDER_QUERY_REJECTED' : 'PROVIDER_READ_FAILED';
}
export function requestBudget(max = 120) {
  let count = 0;
  return { get count() { return count; }, async call(fn) { if (count >= max) throw Error('REQUEST_BUDGET_EXHAUSTED'); count++; return fn(); } };
}
export async function readGscWindow(client, q, window, budget) {
  const filters = gscFilters(q), dailyBody = { ...window, type: 'web', dataState: 'final', dimensions: ['date'], rowLimit: 25000,
    aggregationType: q.page || q.hostname ? 'auto' : 'byProperty', ...filters };
  const dailyResponse = await budget.call(() => client.searchanalytics.query({ siteUrl: q.gscProperty, requestBody: dailyBody }, { timeout: 20000, retry: false }));
  const normalize = (rows, dimensions) => rows.map(r => ({ ...Object.fromEntries(dimensions.map((d,i)=>[d,r.keys[i]])), clicks:r.clicks, impressions:r.impressions, ctr:r.ctr, position:r.position }));
  const daily = normalize(dailyResponse.data.rows || [], ['date']);
  const rows = [], metadata = []; let complete = true;
  const dimensions = ['date','query','page','country','device'];
  for (const chunk of chunks(window)) {
    if (rows.length >= 100000) { complete = false; break; }
    let finished = false;
    for (let page = 0; page < 4; page++) {
      const response = await budget.call(() => client.searchanalytics.query({ siteUrl: q.gscProperty, requestBody: {
        ...chunk, type:'web', dataState:'final', dimensions, aggregationType:'byPage', rowLimit:25000, startRow:page*25000, ...filters
      } }, {timeout:20000,retry:false}));
      const batch = response.data.rows || [];
      const remaining=100000-rows.length;
      rows.push(...normalize(batch,dimensions).slice(0,remaining));
      if(batch.length>remaining) { complete=false; break; }
      metadata.push({ ...chunk, startRow:page*25000, rows:batch.length, aggregation:response.data.responseAggregationType || 'UNKNOWN', metadata:response.data.metadata || null });
      if (batch.length < 25000) { finished = true; break; }
      if (rows.length >= 100000) break;
    }
    if (!finished) { complete = false; break; }
  }
  const sanitized = sanitizeRows(rows);
  const groups = new Map();
  for (const row of sanitized.rows) { const group = intent(row.query); const key = group.brand + ':' + group.intent; const items = groups.get(key) || { ...group, rows:[] }; items.rows.push(row); groups.set(key,items); }
  return { status:'ok', window, daily, totals:aggregateSearch(daily), dailyAggregation:dailyResponse.data.responseAggregationType || dailyBody.aggregationType,
    dailyMetadata:dailyResponse.data.metadata || null, observedDateRange:daily.length ? { start:daily.map(r=>r.date).sort()[0], end:daily.map(r=>r.date).sort().at(-1) } : null,
    detail:{ ...sanitized, rowCount:rows.length, paginationComplete:complete, populationComplete:false, chunks:metadata },
    intentTrends:[...groups.values()].map(g=>({ brand:g.brand, intent:g.intent, ...aggregateSearch(g.rows) })),
    limitations:['GSC dates use America/Los_Angeles; dataState=final. Missing daily dates are not fabricated as zero.', 'Query/page rows are top rows with anonymized queries omitted, not property totals. Pagination completion does not prove population completeness.', 'API maximum 25,000 rows/request; provider top-row limits including daily search-type limits still apply. 31-day chunks, 100,000 detail rows/window local bound.'] };
}
export async function readGa4Window(client, q, window, budget) {
  const common = { property:'properties/' + q.ga4Property, dateRanges:[window], returnPropertyQuota:true };
  const dimensions = ['date','hostName','landingPage','sessionSourceMedium','countryId','deviceCategory','sessionCampaignName','sessionManualAdContent'];
  const reports = {};
  for (const [name,dims,metrics,affiliate] of [
    ['totals',[],['sessions','engagedSessions','engagementRate','userEngagementDuration'],false],
    ['daily',['date'],['sessions','engagedSessions','engagementRate','userEngagementDuration'],false],
    ['landing',dimensions,['sessions','engagedSessions','engagementRate','userEngagementDuration'],false],
    ['affiliate',dimensions,['eventCount'],true]
  ]) {
    const rows=[]; let rowCount=null, complete=false; const meta=[];
    for(let page=0;page<5;page++) {
      const [response] = await budget.call(()=>client.runReport({ ...common, dimensions:dims.map(name=>({name})), metrics:metrics.map(name=>({name})),
        dimensionFilter:ga4Filter(q,affiliate), limit:10000, offset:page*10000, orderBys:dims.map(dimensionName=>({dimension:{dimensionName}})) }, {timeout:20000}));
      const total = Number(response.rowCount || 0);
      if (!Number.isSafeInteger(total) || total < 0 || rowCount !== null && rowCount !== total) throw Error('GA4_PAGINATION_CHANGED');
      rowCount=total; rows.push(...normalizeGa4(response));
      meta.push({ timeZone:response.metadata?.timeZone || 'UNKNOWN', subjectToThresholding:response.metadata?.subjectToThresholding ?? null,
        dataLossFromOtherRow:response.metadata?.dataLossFromOtherRow ?? null, samplingMetadatas:response.metadata?.samplingMetadatas || [],
        schemaRestrictionResponse:response.metadata?.schemaRestrictionResponse || null, propertyQuota:response.propertyQuota || null });
      if(rows.length>=rowCount) { complete=true; break; }
      if(!(response.rows || []).length) throw Error('GA4_PAGINATION_INCOMPLETE');
    }
    reports[name]={ ...sanitizeRows(rows), rowCount, paginationComplete:complete, metadata:meta };
  }
  return { status:'ok', window, ...reports, limitations:[
    'Property calendar dates and returned timezone; matching date labels do not align GSC Pacific day boundaries with GA4 property timezone.',
    'Totals are a separate server report; never sum segmented users or assume segmented sessions equal property totals.',
    'affiliate_click eventCount is attributed to session landing/UTM dimensions, not a person-level conversion or partner revenue join.',
    'Keyword filter applies only to GSC. Landing path is exact in GA4; page filter is contains in GSC. Country codes are ISO2 in GA4 and ISO3 in GSC.',
    'Recent processing, consent, thresholding, sampling and (other) rows can limit observations. Internal/developer filters and native GSC product-link status remain UI_ONLY/UNKNOWN.' ] };
}
export function bingContext(snapshot, q) {
  if (!snapshot) return {status:'UNKNOWN',reason:'NO_STORED_BING_SNAPSHOT'};
  const siteName=q.property==='blog'?'blog.stripunion.com':'stripunion.com';
  const site=snapshot.sites?.find(s=>s.site===siteName);
  if(!site) return {status:'UNKNOWN',reason:'NO_MATCHING_BING_SITE'};
  const rows=(site.queryStats || []).filter(r=>!q.keyword || String(r.Query).toLowerCase().includes(q.keyword.toLowerCase()));
  return { status:'STORED_PROVIDER_CONTEXT_ONLY', collectedAt:snapshot.collectedAt, crawl:bingCrawlEvidence(site,snapshot.collectedAt),
    datedQueryObservations:rows.slice(-50).map(r=>({query:safeText(r.Query),providerDate:bingDate(r.Date),clicks:r.Clicks,impressions:r.Impressions,position:r.AvgImpressionPosition})),
    filtersNotAvailable:['country','device','source','campaign','page'],
    limitation:'Stored Bing weekly/provider rows are contextual evidence, not a matched GSC/GA4 window or market volume. Do not sum their point-date rows into daily totals.' };
}
export async function queryAnalytics({q,gscClient,ga4Client,bingSnapshot,propertyInfo,now=new Date().toISOString()}) {
  const budget=requestBudget(), report={ version:1,kind:'stripunion-on-demand-readonly',collectedAt:now,query:q,queryHash:hash(q),
    properties:{gsc:q.gscProperty,ga4:q.ga4Property,measurementId:'G-K57BRX69X1',ga4Admin:propertyInfo || {status:'UNKNOWN'}},
    scope:{gsc:'Domain includes Blog: do not add Domain and Blog totals',ga4:'One property; default Domain scope includes main/www/Blog, blog scope includes Blog only',
      filterApplicability:{gsc:['keyword','page contains','countryGsc','device','hostname'],ga4:['page exact landing','countryGa4','device','hostname','sourceMedium','campaign','adContent']},
      comparison:'Same number of inclusive calendar days, same property and filters. GSC and GA4 have distinct timezone boundaries; stages are not matched people.'},
    gsc:{status:'NOT_REQUESTED'},ga4:{status:'NOT_REQUESTED'},bing:bingContext(bingSnapshot,q),productionWrites:0,newEventsSent:0 };
  for(const [name,client,read] of [['gsc',gscClient,readGscWindow],['ga4',ga4Client,readGa4Window]]) {
    if(q.sources!=='all' && q.sources!==name)continue;
    const result={status:'ok'};
    for(const [label,window] of [['current',{startDate:q.startDate,endDate:q.endDate}],['previous',q.previous]]) {
      if(name==='gsc' && label==='previous' && !q.gscPreviousAvailable) {result.previous={status:'UNAVAILABLE',reason:'OUTSIDE_GSC_16_MONTH_RETENTION'};continue;}
      try {result[label]=await read(client,q,window,budget);}
      catch(e) { result[label]={status:'failed',error:errorClass(e)};result.status=label==='current'?'failed':'partial'; if(label==='current')break; }
    }
    if (['current','previous'].some(w=>result[w]?.detail?.paginationComplete===false || ['totals','daily','landing','affiliate'].some(k=>result[w]?.[k]?.paginationComplete===false))) result.status='partial';
    report[name]=result;
  }
  report.decisions=decisions(report.gsc,report.ga4);
  report.requests=budget.count;
  report.status=['gsc','ga4'].filter(s=>q.sources==='all'||q.sources===s).every(s=>report[s].status==='ok')?'READY':'PARTIAL';
  return report;
}
export function compactReport(report) {
  return { status:report.status,collectedAt:report.collectedAt,sourceSha:report.sourceSha,queryHash:report.queryHash,query:report.query,properties:report.properties,
    sources:Object.fromEntries(['gsc','ga4'].map(name=>[name,{status:report[name].status,...Object.fromEntries(['current','previous'].map(w=>[w,{status:report[name][w]?.status,
      window:report[name][w]?.window,error:report[name][w]?.error,reason:report[name][w]?.reason,
      totals:name==='gsc'?report[name][w]?.totals:report[name][w]?.totals?.rows,
      paginationComplete:name==='gsc'?report[name][w]?.detail?.paginationComplete:report[name][w]?.landing?.paginationComplete}]))}])),
    bing:report.bing,decisions:report.decisions.slice(0,10),requests:report.requests,productionWrites:0,newEventsSent:0,
    limitations:['Top/query rows and privacy thresholds do not reveal all visits or all searches.','Default GA4 Domain host scope includes Blog. Do not add Blog to Domain.','No person-level attribution or proven SEO uplift. See report.json for source-specific timezone, sampling, thresholding and quota metadata.'] };
}
