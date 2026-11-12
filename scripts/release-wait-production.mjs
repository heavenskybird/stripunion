import fs from 'node:fs/promises';
const checkpoint = JSON.parse(await fs.readFile('../audit/docs/audits/2026-11-12/release-183-checkpoint.json','utf8'));
if(checkpoint.phase==='post') {
  const base='https://developers.hostinger.com/api/hosting/v1/';
  async function get(path) {
    const r=await fetch(base+path,{headers:{authorization:`Bearer ${process.env.HOSTINGER_API_TOKEN}`},signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error('HOSTINGER_READ_HTTP'+r.status);
    const d=await r.json();return d.data??d;
  }
  const websites=await get('websites?per_page=100');
  const site=websites.find(x=>x.domain==='stripunion.com');
  if(!site?.username) throw new Error('PRODUCTION_SITE_NOT_FOUND');
  let ready=false;
  for(let attempt=1;attempt<=20;attempt++) {
    const rows=await get(`accounts/${encodeURIComponent(site.username)}/websites/stripunion.com/nodejs/builds?per_page=100`);
    const newer=rows.filter(x=>(x.uuid??x.id)!==checkpoint.rollbackBuild.id && Date.parse(x.created_at)>Date.parse(checkpoint.rollbackBuild.createdAt)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
    const latest=newer[0];
    console.log('PRODUCTION_BUILD_WAIT '+JSON.stringify({attempt,id:latest?.uuid??latest?.id??null,state:latest?.state??null}));
    if(latest?.state==='completed') {ready=true;break;}
    if(latest?.state==='failed') throw new Error('NEW_PRODUCTION_BUILD_FAILED');
    if(attempt<20) await new Promise(resolve=>setTimeout(resolve,15000));
  }
  if(!ready) throw new Error('POST_MERGE_PRODUCTION_BUILD_NOT_OBSERVED_WITHIN_BOUND');
}
