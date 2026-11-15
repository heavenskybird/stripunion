import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {collectRss,emptyState,reportFor,REGIONS} from './radar.mjs';
const geo=process.env.TRENDS_GEO||'US';if(!REGIONS.includes(geo))throw Error('REGION_NOT_ALLOWED');
const cache=path.resolve('.cache/trends-radar',geo),output=path.resolve('artifacts/trends-radar');
await fs.mkdir(cache,{recursive:true});await fs.mkdir(output,{recursive:true});
let state;try{state=JSON.parse(await fs.readFile(path.join(cache,'state.json')));}catch(e){if(e.code!=='ENOENT')throw Error('TRENDS_CACHE_UNREADABLE_NO_RESET');state=emptyState(geo);}
const outcome=await collectRss({geo,state});
await fs.writeFile(path.join(cache,'state.tmp'),JSON.stringify(outcome.state,null,2)+'\n');await fs.rename(path.join(cache,'state.tmp'),path.join(cache,'state.json'));
if(outcome.xml){const name=new Date().toISOString().replace(/[:.]/g,'-')+'.xml';await fs.mkdir(path.join(cache,'archive'),{recursive:true});await fs.writeFile(path.join(cache,'archive',name),outcome.xml);await fs.writeFile(path.join(output,'official-current.xml'),outcome.xml);}
const archive=path.join(cache,'archive');try{const files=(await fs.readdir(archive)).filter(n=>/^\d{4}-.*\.xml$/.test(n)).sort();for(const name of files.slice(0,-220))await fs.unlink(path.join(archive,name));}catch(e){if(e.code!=='ENOENT')throw e;}
const offers=JSON.parse(await fs.readFile('ops/growth/offers/direct-offers.json')).offers;
const search=JSON.parse(await fs.readFile('ops/seo-data-layer/data/search-growth/latest.json'));
const domain=search.reports.find(r=>r.status==='ok'&&r.snapshot?.siteUrl==='sc-domain:stripunion.com');
const gscRows=domain?.snapshot?.queryPageRows||[];
let bing=null;for(const day of (await fs.readdir('ops/seo-data-layer/data/raw')).sort().reverse()){try{bing=JSON.parse(await fs.readFile('ops/seo-data-layer/data/raw/'+day+'/bing.json'));break;}catch(e){if(e.code!=='ENOENT')throw e;}}
const existingPaths=new Set();for(const f of await fs.readdir('src/pages'))if(f.endsWith('.astro'))existingPaths.add('/'+f.replace(/\.astro$/,''));for(const f of await fs.readdir('src/data/guides'))if(f.endsWith('.js'))existingPaths.add('/guides/'+f.replace(/\.js$/,''));
const report=reportFor(outcome.state,{offers,gscRows,bingRows:bing?.sites?.flatMap(s=>s.queryStats||[])||[],existingPaths});
report.collection={status:outcome.status,requests:outcome.requests,cacheReason:outcome.cacheReason||null};
report.context={gsc:{property:'sc-domain:stripunion.com',collectedAt:search.collectedAt,startDate:domain?.snapshot?.startDate||null,endDate:domain?.snapshot?.endDate||null,scope:'Query-page observations; not property totals'},bing:{collectedAt:bing?.collectedAt||null,scope:'Stored own-site provider rows; not matched RSS interval'},offers:{source:'ops/growth/offers/direct-offers.json',rule:'Only previously active contextual offers qualify; targets remain HOLD'}};
report.sourceSha=process.env.GITHUB_SHA||'LOCAL_UNCOMMITTED';report.productionWrites=0;report.sends=0;report.opportunityProposals=report.candidates.filter(c=>c.decision!=='HOLD').map(c=>({id:'trend-'+c.id,status:'DISCOVERED',query:c.query,geo,firstSeenAt:c.firstSeenAt,evidence:report.sourceUrl,nextAction:'Review existing page and factual offer suitability; no queue/send',targetUrl:c.targetUrl}));
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(output,'cache-state.json'),JSON.stringify(outcome.state,null,2)+'\n');
await fs.writeFile(path.join(output,'opportunity-proposals.json'),JSON.stringify(report.opportunityProposals,null,2)+'\n');
const summary={...report,candidates:report.candidates.slice(0,20)};const serialized=JSON.stringify(summary);console.log('TRENDS_RADAR_BASE64URL '+Buffer.from(serialized).toString('base64url'));console.log('TRENDS_RADAR_SHA256 '+createHash('sha256').update(serialized).digest('hex'));
console.log('TRENDS_RADAR '+JSON.stringify({status:outcome.status,geo,items:report.candidateCount,eligible:report.eligibleCount,outcome:report.outcome,alpha:'NOT_GRANTED',windows:report.windows.map(w=>({hours:w.hours,status:w.status,observations:w.observations})),productionWrites:0,sends:0}));
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,['# Official Trending Now RSS',`Region: ${geo}; collection: ${outcome.status}; source: ${report.sourceUrl}`,`Current items: ${report.candidateCount}; eligible review candidates: ${report.eligibleCount}; Alpha API: NOT_GRANTED`,...report.windows.map(w=>`- ${w.hours}h: ${w.status}; ${w.observations} observations`),'No production writes, publishing, enqueue, registration, conversion or social send.',''].join('\n'));
if(!['OK','NOT_MODIFIED','CACHE_ONLY'].includes(outcome.status))process.exitCode=1;
