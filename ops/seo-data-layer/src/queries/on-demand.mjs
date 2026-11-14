import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { googleCredentials, googleAuth } from '../lib/google-auth.mjs';
import { hash, parseQuery } from '../lib/on-demand-query.mjs';
import { queryAnalytics, compactReport, errorClass } from '../lib/on-demand-engine.mjs';
const reportName=process.env.ANALYTICS_REPORT_NAME || 'query';
if(!/^[a-z0-9-]{1,40}$/.test(reportName)) throw Error('INVALID_REPORT_NAME');
const output=path.resolve('artifacts/analytics-on-demand',reportName);
await fs.mkdir(output,{recursive:true});
let report;
try {
  // Only typed, bounded fields; no raw request bodies, regexes, dimensions or property IDs accepted.
  const q=parseQuery(process.env.ANALYTICS_QUERY_JSON || '{}');
  const gscClient=google.searchconsole({version:'v1',auth:googleAuth(['https://www.googleapis.com/auth/webmasters.readonly'])});
  const ga4Client=new BetaAnalyticsDataClient({credentials:googleCredentials()});
  let propertyInfo;
  try {
    const admin=google.analyticsadmin({version:'v1beta',auth:googleAuth(['https://www.googleapis.com/auth/analytics.readonly'])});
    const r=await admin.properties.get({name:'properties/' + q.ga4Property},{timeout:20000,retry:false});
    propertyInfo={status:'ok',timeZone:r.data.timeZone || 'UNKNOWN',dataFilters:'UI_ONLY/UNKNOWN',nativeGscProductLink:'UNKNOWN'};
  } catch(e) {propertyInfo={status:'UNKNOWN',error:errorClass(e)};}
  let bingSnapshot=null;
  const raw=new URL('../../data/raw/',import.meta.url);
  for(const day of (await fs.readdir(raw)).sort().reverse()) {
    try {bingSnapshot=JSON.parse(await fs.readFile(new URL(day+'/bing.json',raw)));break;} catch(e) {if(e.code!=='ENOENT')throw Error('BING_SNAPSHOT_INVALID');}
  }
  report=await queryAnalytics({q,gscClient,ga4Client,bingSnapshot,propertyInfo});
  report.sourceSha=process.env.GITHUB_SHA || 'LOCAL_UNCOMMITTED';
  report.runUrl=process.env.GITHUB_RUN_ID ? 'https://github.com/heavenskybird/stripunion/actions/runs/'+process.env.GITHUB_RUN_ID : null;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  const compact=compactReport(report);
  await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(compact,null,2)+'\n');
  const md=[`# First-party analytics — ${report.status}`,'',`Source SHA: ${report.sourceSha}`,`Collected: ${report.collectedAt}`,`Requested: ${q.startDate}..${q.endDate}; previous ${q.previous.startDate}..${q.previous.endDate}`,`GSC: ${q.gscProperty} / Pacific dates; GA4: ${q.ga4Property} / ${propertyInfo.timeZone || 'UNKNOWN'}`,'',
    'See report.json for filters, pagination, quotas, thresholding, sampling and date boundaries. Domain includes Blog; totals are not additive. GA4 keyword search is not available. affiliate_click counts are measured aggregate events, not partner earnings.','',
    ...report.decisions.slice(0,10).map(d=>'- '+d.action+' '+(d.url || '')+' — '+d.reason),
    '',`Bing: ${report.bing.status}; stored context only. No matching-window claim.`,`Requests (Data/GSC): ${report.requests}; Admin property read: 1. Production writes: 0. Events sent: 0.`,''].join('\n');
  await fs.writeFile(path.join(output,'report.md'),md);
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,md);
  // Base64 avoids GitHub secret-mask collisions on JSON braces. This contains only the sanitized aggregate summary.
  console.log('REPORT_JSON_BASE64URL '+Buffer.from(JSON.stringify(compact)).toString('base64url'));
  console.log('REPORT_JSON_SHA256 '+hash(compact));
  console.log('REPORT_READY '+JSON.stringify({reportName,status:report.status,runUrl:report.runUrl,sourceSha:report.sourceSha,queryHash:report.queryHash,artifact:'analytics-on-demand-'+process.env.GITHUB_RUN_ID,productionWrites:0,newEventsSent:0}));
  if(report.status!=='READY')process.exitCode=1;
} catch(e) {
  const code=/^(?:INVALID_|UNKNOWN_QUERY_|PROPERTY_|DAYS_|DATE_|GSC_|GA4_COUNTRY_|UNSAFE_|PAGE_|DEVICE_|HOST_|BLOG_HOST_)/.test(e.message) ? e.message.split(':')[0] : errorClass(e);
  await fs.writeFile(path.join(output,'error.json'),JSON.stringify({status:'FAILED',error:code,productionWrites:0,newEventsSent:0})+'\n');
  console.log('REPORT_FAILED '+code);process.exitCode=1;
}
