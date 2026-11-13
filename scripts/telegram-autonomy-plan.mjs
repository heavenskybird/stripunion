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
const existing=[];
for(const f of (await fs.readdir('ops/social-outbox/events')).filter(f=>f.startsWith('telegram-autonomy__')&&f.endsWith('.json')))existing.push({file:f,event:JSON.parse(await fs.readFile('ops/social-outbox/events/'+f))});
// Current official query/page demand supplies future candidates beyond five hubs.
const window=domain.decisions.find(w=>w.name==='current7'), pages=new Map();
for(const row of domain.snapshot.queryPageRows||[]){if(row.date<window.startDate||row.date>window.endDate)continue;try{const url=contentIdentity({url:row.page}).url;if(new URL(url).pathname==='/')continue;const p=pages.get(url)||{url,impressions:0,clicks:0};p.impressions+=Number(row.impressions)||0;p.clicks+=Number(row.clicks)||0;pages.set(url,p);}catch{}}
const candidates=hubs.filter(h=>Number(h.impressions)>0&&copy[h.slug]).map(h=>({...h,url:'https://stripunion.com/'+h.slug+'/'}));
for(const page of pages.values())if(page.impressions>=20&&!candidates.some(c=>contentIdentity(c).url===page.url))candidates.push({...page,slug:new URL(page.url).pathname.replace(/^\/|\/$/g,'').replaceAll('/','-')});
const pending=existing.find(r=>r.event.state==='pending'&&Number(r.event.attempt_count||0)===0);
if(pending){const candidate=candidates.find(c=>contentIdentity(c).url===contentIdentity(pending.event).url);if(candidate&&!contentConflict(contentIdentity(pending.event),prior)){pending.event.selection_checked_at=snapshot.collectedAt;await fs.writeFile('ops/social-outbox/events/'+pending.file,JSON.stringify(pending.event,null,2)+'\n');console.log('TELEGRAM_AUTONOMY_PLAN '+JSON.stringify({planned:0,reason:'REFRESHED_ONE_PENDING_CANDIDATE',providerSends:0}));process.exit(0);}pending.event.state='held_no_current_demand';pending.event.last_error='No fresh distinct official search signal; no attempt made';await fs.writeFile('ops/social-outbox/events/'+pending.file,JSON.stringify(pending.event,null,2)+'\n');}
let analytics=null;
for(const day of (await fs.readdir('ops/seo-data-layer/data/raw')).sort().reverse().slice(0,5)){try{const a=JSON.parse(await fs.readFile('ops/seo-data-layer/data/raw/'+day+'/ga4.json'));if(Date.now()-Date.parse(a.collectedAt)<48*3600000){analytics=a;break;}}catch{}}
for(const c of candidates){const sessionRows=(analytics?.rows||[]).filter(r=>r.hostName===new URL(c.url).hostname&&String(r.landingPagePlusQueryString||'').split('?')[0].replace(/\/$/,'')===new URL(c.url).pathname.replace(/\/$/,''));c.measuredSessions=sessionRows.reduce((n,r)=>n+(Number(r.sessions)||0),0);c.score=c.impressions/(c.clicks+1)+(c.measuredSessions>=20?Math.min(20,c.measuredSessions/5):0);}

for(const hub of candidates.sort((a,b)=>b.score-a.score).slice(0,30)){
 const url=hub.url.endsWith('/')?hub.url:hub.url+'/';
 const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});const html=await response.text();
 const canonical=html.match(/rel="canonical" href="([^"]+)"/)?.[1];
 if(response.status!==200||!canonical||contentIdentity({url:canonical}).url!==contentIdentity({url}).url||/name="robots" content="[^"]*noindex/.test(html)||/noindex/i.test(response.headers.get('x-robots-tag')||''))continue;
 const pageTitle=html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s*[|·]\s*StripUnion.*$/i,'').replaceAll('&amp;','&');
 const [title,excerpt]=copy[hub.slug]||[pageTitle,'Adults 18+ · independent editorial guide · affiliate links disclosed.'];
 if(!title)continue;const identity=contentIdentity({title,excerpt,url});if(contentConflict(identity,prior))continue;
 const filename='ops/social-outbox/events/telegram-autonomy__'+hub.slug+'.json';try{await fs.access(filename);continue;}catch(e){if(e.code!=='ENOENT')throw e;}

 const now=new Date().toISOString();const id='telegram-autonomy:'+createHash('sha256').update(identity.url).digest('hex');
 await fs.writeFile(filename,JSON.stringify({version:1,event_id:id,idempotency_key:id,publication_id:'hub:'+hub.slug,source:'telegram-autonomy',slug:hub.slug,title,excerpt,url,topic_key:hub.slug,channel:'telegram',provider:'telegram',state:'pending',attempt_count:0,desired_at:now,created_at:now,updated_at:now,selection_source:'official-search-demand',selection_checked_at:snapshot.collectedAt,selection_evidence:{impressions:hub.impressions,clicks:hub.clicks,measuredSessions:hub.measuredSessions,analyticsStatus:analytics?'OBSERVED':'UNKNOWN',window:domain.decisions.find(w=>w.name==='current7').endDate}},null,2)+'\n',{flag:'wx'});planned++;break;}
console.log('TELEGRAM_AUTONOMY_PLAN '+JSON.stringify({planned,providerSends:0,channel:'@StripUnion'}));
