import {BetaAnalyticsDataClient}from'@google-analytics/data';import{googleCredentials}from'../lib/google-auth.mjs';import{daysAgo,writeSnapshot}from'../lib/io.mjs';import{readGa4Report,hostFunnel}from'../lib/ga4-reports.mjs';
const propertyId=process.env.GA4_PROPERTY_ID||'530171093',endDate=process.env.SEO_END_DATE||daysAgo(1),startDate=process.env.SEO_START_DATE||daysAgo(31);
const client=new BetaAnalyticsDataClient({credentials:googleCredentials()});
const common={property:`properties/${propertyId}`,dateRanges:[{startDate,endDate}]};
const dims=names=>names.map(name=>({name})),metrics=dims;
const sessionMetrics=['sessions','activeUsers','totalUsers','engagedSessions','keyEvents','screenPageViews','userEngagementDuration'];
const landing=await readGa4Report(client,{...common,dimensions:dims(['date','hostName','landingPagePlusQueryString','sessionSourceMedium','sessionDefaultChannelGroup','country','deviceCategory']),metrics:metrics(sessionMetrics)});
const market=await readGa4Report(client,{...common,dimensions:dims(['date','hostName','country','language','deviceCategory']),metrics:metrics(sessionMetrics)});
const events=await readGa4Report(client,{...common,dimensions:dims(['date','eventName','hostName','pagePath','sessionSourceMedium','sessionCampaignName','sessionManualAdContent']),metrics:metrics(['eventCount','totalUsers'])});
const daily=await readGa4Report(client,{...common,dimensions:dims(['date','hostName']),metrics:metrics(sessionMetrics)});
const diagnostic=await readGa4Report(client,{...common,dimensions:dims(['date','eventName','hostName']),metrics:metrics(['eventCount']),dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'recovery_consent_check'}}}});
const reports={landing,market,events,daily,diagnostic};
const snapshot={source:'google-analytics-4',propertyId,startDate,endDate,collectedAt:new Date().toISOString(),propertyTimeZone:daily.metadata.timeZone,rowCount:landing.rows.length,marketRowCount:market.rows.length,eventRowCount:events.rows.length,rows:landing.rows,marketRows:market.rows,eventRows:events.rows,dailyHostRows:daily.rows,
 dataQuality:{complete:Object.values(reports).every(r=>r.complete),recentDates:'PROVISIONAL_PROVIDER_PROCESSING_LAG',consentCoverage:'Only measured consent-respecting traffic; unobserved visits cannot be inferred',users:'Non-additive across dates/dimensions; do not sum as unique people',reports:Object.fromEntries(Object.entries(reports).map(([k,r])=>[k,{rowCount:r.rowCount,complete:r.complete,...r.metadata}]))},
 funnel:hostFunnel(daily.rows,events.rows),diagnostic:{newEventsSent:0,eventName:'recovery_consent_check',rows:diagnostic.rows,status:diagnostic.rows.length?'EXISTING_EVENT_OBSERVED':'INGESTION_UNCONFIRMED'},telegramPerformance:landing.rows.filter(r=>/^telegram\s*\//i.test(r.sessionSourceMedium||'')),
 scope:'GA4 property calendar dates. GSC uses Pacific dates; Bing/provider windows differ. Report stage counts separately; never invent end-to-end person-level matching.'};
await writeSnapshot('ga4',endDate,snapshot);console.log('GA4_OFFICIAL_ACCEPTANCE '+JSON.stringify({propertyId,propertyTimeZone:snapshot.propertyTimeZone,startDate,endDate,funnel:snapshot.funnel,complete:snapshot.dataQuality.complete,diagnostic:snapshot.diagnostic.status,newEventsSent:0}));
