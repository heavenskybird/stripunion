import fs from 'node:fs/promises';
import {getRecords,newestFirst} from './hostinger-readonly-check.mjs';
const token=process.env.HOSTINGER_API_TOKEN;
async function get(endpoint){
 const r=await fetch('https://developers.hostinger.com/api/hosting/v1/'+endpoint,{method:'GET',redirect:'error',headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('HOSTINGER_READ_HTTP_'+r.status);return r.json();
}
let report={checkedAt:new Date().toISOString(),domain:'stripunion.com',productionWrites:0,status:'UNKNOWN'};
try{
 if(!token)throw Error('HOSTINGER_CREDENTIAL_NOT_AVAILABLE');
 const list=await get('websites?per_page=100');const website=getRecords(list).find(w=>w.domain==='stripunion.com');
 if(!website?.username)throw Error('CANONICAL_PRODUCTION_WEBSITE_NOT_FOUND');
 const prefix='accounts/'+encodeURIComponent(website.username)+'/websites/stripunion.com/';
 const build=newestFirst(getRecords(await get(prefix+'nodejs/builds?per_page=100')))[0];
 report={...report,status:'READ_VERIFIED',build:build?{id:build.uuid||build.id,state:build.state||build.status,createdAt:build.created_at||build.createdAt,providerCommitSha:build.commit_sha||build.commitSha||null}:null,
 note:'Production domain metadata, separate from staging. Null provider commit is UNKNOWN; served CTA contract fingerprints provide separate content proof. No deployment or config API called.'};
}catch{report.reason='PRODUCTION_BUILD_METADATA_UNVERIFIED';}
await fs.mkdir('artifacts/commercial',{recursive:true});await fs.writeFile('artifacts/commercial/production-hostinger.json',JSON.stringify(report,null,2)+'\n');console.log('COMMERCIAL_HOSTINGER '+JSON.stringify(report));
if(report.status!=='READ_VERIFIED')process.exitCode=1;
