import fs from 'node:fs/promises';import{createHash}from'node:crypto';import{journal}from'./social-outbox-safety.mjs';import{REGISTRY_ID,contentIdentity,manualEntries,contentConflict,registryEntries,validateTelegramPolicy}from'./telegram-autonomy-policy.mjs';
const policy=validateTelegramPolicy(JSON.parse(await fs.readFile('ops/social-outbox/telegram-policy.json')));
const registry=await journal({idempotency_key:REGISTRY_ID});const prior=[...manualEntries(policy),...registryEntries(registry)];
const snapshot=JSON.parse(await fs.readFile('ops/seo-data-layer/data/search-growth/latest.json'));
if(Date.now()-Date.parse(snapshot.collectedAt)>48*3600000||Date.parse(snapshot.collectedAt)>Date.now())throw Error('TELEGRAM_SEARCH_EVIDENCE_STALE');
const domain=snapshot.reports.find(r=>r.status==='ok'&&r.snapshot?.siteUrl==='sc-domain:stripunion.com');if(!domain)throw Error('TELEGRAM_DOMAIN_SEARCH_EVIDENCE_MISSING');
const hubs=domain.decisions.find(w=>w.name==='current7')?.hubs||[];
const copy={
 'chaturbate-alternatives':['Chaturbate alternatives: compare before you switch','Compare public-room browsing, private interaction and platform fit. An independent guide for adults 18+.'],
 'stripchat-alternatives':['Stripchat alternatives: choose by the features you need','A practical comparison of browsing and private interaction, with affiliate links clearly disclosed. Adults 18+ only.'],
 'livejasmin':['LiveJasmin: understand credits and private interaction','Review the platform model and comparison options before deciding whether it fits your needs. Independent information for adults 18+.'],
 'xhamster':['xHamster: a guide to the platform and alternatives','Understand the site category and relevant alternatives before choosing where to browse. Independent information for adults 18+.']};
let planned=0;await fs.mkdir('ops/social-outbox/events',{recursive:true});
for(const hub of hubs.filter(h=>Number(h.impressions)>0&&copy[h.slug]).sort((a,b)=>b.impressions/(b.clicks+1)-a.impressions/(a.clicks+1))){const [title,excerpt]=copy[hub.slug];const url='https://stripunion.com/'+hub.slug+'/';const identity=contentIdentity({title,excerpt,url});if(contentConflict(identity,prior))continue;
 const filename='ops/social-outbox/events/telegram-autonomy__'+hub.slug+'.json';try{await fs.access(filename);continue;}catch(e){if(e.code!=='ENOENT')throw e;}
 const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});const html=await response.text();if(response.status!==200||!html.includes('rel="canonical" href="'+url+'"')||/name="robots" content="[^"]*noindex/.test(html))throw Error('TELEGRAM_TARGET_NOT_VERIFIED');
 const now=new Date().toISOString();const id='telegram-autonomy:'+createHash('sha256').update(identity.url).digest('hex');
 await fs.writeFile(filename,JSON.stringify({version:1,event_id:id,idempotency_key:id,publication_id:'hub:'+hub.slug,source:'telegram-autonomy',slug:hub.slug,title,excerpt,url,topic_key:hub.slug,channel:'telegram',provider:'telegram',state:'pending',attempt_count:0,desired_at:now,created_at:now,updated_at:now,selection_source:'official-search-demand',selection_checked_at:snapshot.collectedAt,selection_evidence:{impressions:hub.impressions,clicks:hub.clicks,window:domain.decisions.find(w=>w.name==='current7').endDate}},null,2)+'\n',{flag:'wx'});planned++;break;}
console.log('TELEGRAM_AUTONOMY_PLAN '+JSON.stringify({planned,providerSends:0,channel:'@StripUnion'}));
