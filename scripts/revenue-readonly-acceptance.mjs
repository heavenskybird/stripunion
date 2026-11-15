// One bounded GET per provider; no conversion generation, reconciliation writes or production deployment.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildRevenueTruth,sanitizeAttributionSummary} from '../ops/growth/lib/revenue-truth.mjs';
import {latestRevenueInput,knownRevenuePageRoutes} from '../ops/growth/lib/revenue-inputs.mjs';
import {normalizeStripCashPayload} from '../ops/seo-data-layer/src/collectors/stripcash.mjs';
const out='artifacts/revenue-readonly', raw=path.join(out,'raw'), date=new Date().toISOString().slice(0,10);
await fs.mkdir(path.join(raw,date),{recursive:true});
const sourceStatus={};
const sourceSha=process.env.GITHUB_SHA || 'LOCAL_UNCOMMITTED';
let attribution=null,partner=null;
async function read(url,headers) {
  const response=await fetch(url,{method:'GET',redirect:'error',headers,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('PROVIDER_GET_HTTP_'+response.status);
  return response.json();
}
function status(error) {return /^PROVIDER_GET_HTTP_\d+$|^ATTRIBUTION_\w+$/.test(error.message)?error.message:'READ_NOT_VERIFIED';}
if(process.argv.includes('--live')) {
  try {
    if(!process.env.STRIPCASH_STATS_API_TOKEN)throw Error('CREDENTIAL_MISSING');
    const source=await fs.readFile('src/config/site.js','utf8');
    const userId=source.match(/STRIPCASH_USER_ID\s*=\s*['"]([a-f0-9]{64})['"]/i)?.[1];
    if(!userId)throw Error('ACCOUNT_ID_NOT_FOUND');
    const url=new URL('https://api.stripcash.com/external/v1/user/statistics');url.searchParams.set('userId',userId);
    partner=normalizeStripCashPayload(await read(url,{authorization:'Bearer '+process.env.STRIPCASH_STATS_API_TOKEN,accept:'application/json'}));sourceStatus.partner='GET_VERIFIED';
  }catch(e){sourceStatus.partner=status(e);}
  try {
    if(!process.env.STRIPCASH_POSTBACK_SECRET)throw Error('CREDENTIAL_MISSING');
    const payload=await read('https://stripunion-live-models.stripunion.workers.dev/analytics/summary',{'x-stripunion-attribution-token':process.env.STRIPCASH_POSTBACK_SECRET,accept:'application/json'});
    if(payload.ok!==true)throw Error('ATTRIBUTION_SUMMARY_INVALID');
    attribution=sanitizeAttributionSummary(payload.summary);sourceStatus.attribution='GET_VERIFIED';
  }catch(e){sourceStatus.attribution=status(e);}
} else {
  const root='ops/seo-data-layer/data/raw';
  attribution=(await latestRevenueInput(root,'attribution'))?.data || null;partner=(await latestRevenueInput(root,'stripcash'))?.data || null;
  sourceStatus.partner=partner?'STORED_SNAPSHOT':'UNAVAILABLE';sourceStatus.attribution=attribution?'STORED_SNAPSHOT':'UNAVAILABLE';
}
if(attribution)await fs.writeFile(path.join(raw,date,'attribution.json'),JSON.stringify(attribution,null,2)+'\n');
if(partner)await fs.writeFile(path.join(raw,date,'stripcash.json'),JSON.stringify(partner,null,2)+'\n');
const truth=buildRevenueTruth({attribution,partner,pageRoutes:await knownRevenuePageRoutes('.')});
const report={sourceSha,collectedAt:new Date().toISOString(),mode:process.argv.includes('--live')?'LIVE_GET_ONLY':'STORED_EVIDENCE',sourceStatus,...truth};
await fs.writeFile(path.join(out,'revenue-truth.json'),JSON.stringify(report,null,2)+'\n');
// Brain output is isolated in artifacts; no source snapshots or tracked decisions are rewritten.
const brain=spawnSync(process.execPath,['ops/growth/brain.mjs'],{encoding:'utf8',env:{...process.env,GROWTH_BRAIN_OUTPUT_DIR:path.join(out,'brain'),GROWTH_REVENUE_RAW_ROOT:raw},timeout:30000});
if(brain.status!==0)throw Error('ISOLATED_BRAIN_READINESS_FAILED');
const compact={sourceSha,mode:report.mode,collectedAt:report.collectedAt,sourceStatus,businessCurrency:truth.businessCurrency,confirmedUsd:truth.confirmedUsd,
  pending:truth.pending,partnerFunnel:truth.partnerFunnel,unmatched:truth.unmatched,pages:truth.pages,windowComparison:truth.windowComparison,requiredEvidence:truth.requiredEvidence,productionWrites:0,syntheticConversions:0};
console.log('REVENUE_READONLY_REPORT_BASE64URL '+Buffer.from(JSON.stringify(compact)).toString('base64url'));
console.log('REVENUE_READONLY_ACCEPTANCE '+JSON.stringify({sourceSha,sourceStatus,confirmedUsd:truth.confirmedUsd.amount,unmatched:truth.unmatched.totalUnmatched,unexplained:truth.unmatched.unexplainedUnmatched,pageKeys:truth.pages.length,productionWrites:0,syntheticConversions:0}));
const md=['# Revenue evidence — read-only','',`Source SHA: ${sourceSha}`,`Collected: ${report.collectedAt}`,`Sources: ${JSON.stringify(sourceStatus)}`,
  'Business currency USD is owner-confirmed. Historical UNKNOWN stays UNKNOWN.',`Confirmed scoped USD commission: ${truth.confirmedUsd.amount ?? 'UNKNOWN'}`,`Partner reported default-scope totalEarnings: ${truth.pending.partnerReportedCommission ?? 'UNKNOWN'} (not a scoped statement)`,
  `Unmatched: ${truth.unmatched.totalUnmatched ?? 'UNKNOWN'}; unexplained by deployed diagnostic counters: ${truth.unmatched.unexplainedUnmatched ?? 'UNKNOWN'}`,
  `Page keys: ${truth.pages.length}; unique/qualified conversions and paid page revenue remain unproven.`,
  'Do not compare Today clicks, default aggregate, payout due, GA4 sessions and cumulative postbacks as one cohort.','',...truth.requiredEvidence.map(x=>'- '+x),''].join('\n');
await fs.writeFile(path.join(out,'report.md'),md);
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,md);
if(process.argv.includes('--live')&&!Object.values(sourceStatus).every(s=>s==='GET_VERIFIED'))process.exitCode=1;
