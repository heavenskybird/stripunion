import { createHash } from 'node:crypto';
export const REGIONS=['US','GB','CA','AU'];
export const WINDOWS=[4,24,48,168];
const HOUR=3600000, MAX_BYTES=2*1024*1024;
const digest=value=>createHash('sha256').update(value).digest('hex');
const timestamp=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export function normalizeQuery(value){return String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function entities(value){return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>{
 if(v[0]==='#'){const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);if(n<1||n>0x10ffff||n>=0xd800&&n<=0xdfff)throw Error('XML_INVALID_ENTITY');return String.fromCodePoint(n);}
 return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[v.toLowerCase()];
}).replace(/&(?!(?:[^\s&]*;))/g,'&');}
// Bounded strict RSS subset: no DTD/external entities, namespace names preserved,
// balanced tags and quoted attributes. No third-party parser or network resolver.
export function parseRss(xml){
 if(typeof xml!=='string'||Buffer.byteLength(xml)>MAX_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('RSS_UNSAFE_OR_TOO_LARGE');
 const stack=[],items=[];let item=null,at=0,rootSeen=false,channelSeen=false;
 function text(value,cdata=false){if(!stack.length&&value.trim())throw Error('XML_TEXT_OUTSIDE_ROOT');if(!item)return;const key=stack.at(-1);if(['title','pubDate','ht:approx_traffic','link'].includes(key)&&stack.at(-2)==='item')item[key]=(item[key]||'')+(cdata?value:entities(value));}
 while(at<xml.length){if(xml[at]!=='<'){const end=xml.indexOf('<',at);const stop=end<0?xml.length:end;const raw=xml.slice(at,stop);if(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(raw))throw Error('XML_UNKNOWN_ENTITY');text(raw);at=stop;continue;}
  if(xml.startsWith('<!--',at)){const end=xml.indexOf('-->',at+4);if(end<0)throw Error('XML_COMMENT_UNCLOSED');at=end+3;continue;}
  if(xml.startsWith('<![CDATA[',at)){const end=xml.indexOf(']]>',at+9);if(end<0)throw Error('XML_CDATA_UNCLOSED');text(xml.slice(at+9,end),true);at=end+3;continue;}
  if(xml.startsWith('<?xml',at)){if(rootSeen)throw Error('XML_DECLARATION_POSITION');const end=xml.indexOf('?>',at);if(end<0)throw Error('XML_DECLARATION_UNCLOSED');at=end+2;continue;}
  let end=at+1,quote=null;for(;end<xml.length;end++){const c=xml[end];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
  if(end===xml.length||quote)throw Error('XML_TAG_UNCLOSED');
  const raw=xml.slice(at+1,end);at=end+1;const match=/^(\/?)([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)$/.exec(raw);if(!match)throw Error('XML_TAG_INVALID');
  const [,closing,name,attrs,self]=match;
  if(closing){if(attrs.trim()||self||stack.pop()!==name)throw Error('XML_TAG_MISMATCH');if(name==='item'){if(!item)throw Error('RSS_ITEM_INVALID');items.push(item);item=null;}continue;}
  let rest=attrs;const seen=new Set();while(rest.trim()){const a=/^\s+([A-Za-z_][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/.exec(rest);if(!a||seen.has(a[1]))throw Error('XML_ATTRIBUTE_INVALID');seen.add(a[1]);rest=rest.slice(a[0].length);}
  if(!stack.length){if(rootSeen||name!=='rss')throw Error('RSS_ROOT_REQUIRED');rootSeen=true;}
  if(name==='channel'&&stack.at(-1)==='rss')channelSeen=true;
  if(name==='item'){if(stack.at(-1)!=='channel'||item)throw Error('RSS_ITEM_POSITION');item={};}
  if(!self)stack.push(name);else if(name==='item'){items.push(item);item=null;}
 }
 if(stack.length||!rootSeen||!channelSeen)throw Error('RSS_MALFORMED');
 return items.slice(0,200).map(r=>({query:String(r.title||'').trim().slice(0,200),providerPublishedAt:timestamp(r.pubDate),approxTrafficLabel:String(r['ht:approx_traffic']||'').trim().slice(0,30),providerLink:String(r.link||'').trim()})).filter(r=>r.query);
}
export function emptyState(geo){if(!REGIONS.includes(geo))throw Error('REGION_NOT_ALLOWED');return {version:1,geo,observations:[],items:[],lastAttemptAt:null,lastSuccessAt:null,nextFetchAt:null,failures:0,etag:null,lastModified:null,bodyHash:null};}
export function validateState(state,geo){if(!state||state.version!==1||state.geo!==geo||!Array.isArray(state.observations)||!Array.isArray(state.items)||state.observations.length>500||state.items.length>5000)throw Error('TRENDS_CACHE_INVALID');
 if(!Number.isInteger(state.failures)||state.failures<0||state.observations.some(t=>!timestamp(t))||['lastAttemptAt','lastSuccessAt','nextFetchAt'].some(k=>state[k]!==null&&!timestamp(state[k]))||state.items.some(r=>r.geo!==geo||r.id!==digest(geo+':'+normalizeQuery(r.query))||r.normalizedQuery!==normalizeQuery(r.query)||!timestamp(r.firstSeenAt)||!timestamp(r.lastSeenAt)||Date.parse(r.firstSeenAt)>Date.parse(r.lastSeenAt)))throw Error('TRENDS_CACHE_INVALID');return state;}
export function cacheDecision(state,now=Date.now()){
 if(state.nextFetchAt&&Date.parse(state.nextFetchAt)>now)return {fetch:false,reason:'BACKOFF',until:state.nextFetchAt};
 if(state.lastSuccessAt&&now-Date.parse(state.lastSuccessAt)<10*60000)return {fetch:false,reason:'MIN_INTERVAL_10_MINUTES'};
 return {fetch:true};
}
export function updateHistory(state,rows,now=new Date().toISOString()){
 const nowMs=Date.parse(now);if(!Number.isFinite(nowMs)||state.lastSuccessAt&&Date.parse(state.lastSuccessAt)>nowMs)throw Error('TRENDS_CLOCK_REGRESSION');
 const existing=new Map(state.items.map(r=>[r.id,r]));
 for(const row of rows){const key=normalizeQuery(row.query);const id=digest(state.geo+':'+key);const prior=existing.get(id);existing.set(id,{...prior,...row,id,geo:state.geo,normalizedQuery:key,firstSeenAt:prior?.firstSeenAt||now,lastSeenAt:now});}
 return {...state,items:[...existing.values()].filter(r=>nowMs-Date.parse(r.lastSeenAt)<=8*24*HOUR).slice(-5000),observations:[...state.observations.filter(t=>nowMs-Date.parse(t)<=8*24*HOUR),now].filter((t,i,a)=>a.indexOf(t)===i).slice(-500),lastAttemptAt:now,lastSuccessAt:now,nextFetchAt:null,failures:0};
}
export function windowCoverage(state,hours,now=Date.now()){
 const start=now-hours*HOUR;const times=state.observations.map(Date.parse).filter(n=>Number.isFinite(n)&&n<=now).sort((a,b)=>a-b);
 const preceding=times.filter(t=>t<=start).at(-1);const inside=times.filter(t=>t>start);const points=preceding===undefined?inside:[preceding,...inside];
 const gaps=points.slice(1).map((t,i)=>t-points[i]);const fresh=times.length&&now-times.at(-1)<=90*60000;
 return {hours,start:new Date(start).toISOString(),end:new Date(now).toISOString(),status:preceding===undefined?'INSUFFICIENT_HISTORY':!fresh||gaps.some(g=>g>90*60000)?'OBSERVATION_GAPS':'OBSERVED_SNAPSHOT_HISTORY',observations:inside.length,earliestObservedAt:times.length?new Date(times[0]).toISOString():null,maxGapMinutes:gaps.length?Math.max(...gaps)/60000:null,interpretation:'Coverage of archived current RSS snapshots, not exhaustive historic trends or Explore history.'};
}
export function rankCandidate(item,{offers=[],gscRows=[],bingRows=[],existingPaths=new Set(),now=Date.now()}={}){
 const q=item.normalizedQuery,brand=/stripcash/.test(q)?'stripcash':/stripchat/.test(q)?'stripchat':/chaturbate/.test(q)?'chaturbate':/livejasmin|live jasmin/.test(q)?'livejasmin':/bongacams/.test(q)?'bongacams':/lovense/.test(q)?'lovense':/nutaku/.test(q)?'nutaku':/dlsite/.test(q)?'dlsite':null;
 const unsafe=/\b(?:child|children|teen|underage|minor|schoolgirl|leak|leaked|nonconsensual)\b/.test(q);
 const comparison=/alternatives?|compare|comparison|\bvs\b/.test(q),affiliate=/affiliate|webmaster|commission/.test(q);
 const offerId=affiliate&&/stripcash|stripchat/.test(q)?'stripcash-affiliate-referral':brand==='stripchat'||comparison&&['chaturbate','livejasmin'].includes(brand)?'avcams':brand;
 const approved=offers.find(o=>o.id===offerId&&o.status==='active');
 const matches=gscRows.filter(r=>brand&&normalizeQuery(r.query||'').includes(brand));
 const impressions=matches.reduce((n,r)=>n+Number(r.impressions||0),0),clicks=matches.reduce((n,r)=>n+Number(r.clicks||0),0);
 const paths={stripchat:comparison?'/stripchat-alternatives/':/app|mobile/.test(q)?'/stripchat-app/':'/stripchat/',chaturbate:comparison?'/chaturbate-alternatives/':'/chaturbate/',livejasmin:'/livejasmin/',bongacams:'/bongacams/'};
 const target=affiliate&&['stripcash','stripchat'].includes(brand)?'/stripcash-affiliate-program':paths[brand]||null;const exists=target&&existingPaths.has(target.replace(/\/$/,''));
 const recent=item.providerPublishedAt&&now-Date.parse(item.providerPublishedAt)>=0&&now-Date.parse(item.providerPublishedAt)<=24*HOUR;
 let reason=unsafe?'UNSAFE_OR_AGE_AMBIGUOUS_QUERY':!brand?'NO_RELEVANT_ADULT_COMMERCIAL_INTENT':!approved?'NO_APPROVED_CONTEXTUAL_OFFER':!recent?'NO_RECENT_PROVIDER_TIMESTAMP':null;
 return {id:item.id,query:item.query,geo:item.geo,firstSeenAt:item.firstSeenAt,lastSeenAt:item.lastSeenAt,providerPublishedAt:item.providerPublishedAt,source:'OFFICIAL_TRENDING_NOW_RSS',brand,offerId:approved?.id||null,
  decision:reason?'HOLD':exists?'UPDATE_EXISTING_HUB':'REVIEW_NEW_CONTENT',reason:reason||'RECENT_RELEVANT_SIGNAL_WITH_APPROVED_OFFER_REQUIRES_EDITORIAL_REVIEW',targetUrl:exists?'https://stripunion.com'+target:null,indexStatus:'UNKNOWN',
  gsc:{scope:'Stored query-page observations; not property total',impressions,clicks,rows:matches.length},bing:{matchedRows:bingRows.filter(r=>brand&&normalizeQuery(r.Query||r.query||'').includes(brand)).length,scope:'Stored own-site query context, not market search volume'},
  priority:reason?0:exists?100+Math.min(100,impressions):20,reviewRequired:true,publishAllowed:false,sendAllowed:false};
}
export function reportFor(state,context={},now=Date.now()){
 const candidates=state.items.filter(r=>Date.parse(r.lastSeenAt)===Date.parse(state.lastSuccessAt)).map(r=>rankCandidate(r,{...context,now})).sort((a,b)=>b.priority-a.priority);
 const eligible=candidates.filter(r=>r.decision!=='HOLD');
 return {version:1,reportGeneratedAt:new Date(now).toISOString(),collectedAt:state.lastSuccessAt,geo:state.geo,sourceUrl:`https://trends.google.com/trending/rss?geo=${state.geo}`,alphaApi:{status:'NOT_GRANTED',queried:false},sourceMode:'OFFICIAL_PUBLIC_RSS_CURRENT_SNAPSHOT',cache:{lastSuccessAt:state.lastSuccessAt,nextFetchAt:state.nextFetchAt,bodyHash:state.bodyHash},windows:WINDOWS.map(h=>windowCoverage(state,h,now)),candidateCount:candidates.length,eligibleCount:eligible.length,
  candidates,reviewCandidate:eligible[0]?{...eligible[0],draft:`Adults 18+ only. Our existing ${eligible[0].brand} guide addresses platform fit and alternatives. Review current official terms before choosing a service. Independent information; paid referrals are disclosed. ${eligible[0].targetUrl||''}`,state:'REVIEW_REQUIRED_NOT_QUEUED'}:null,
  outcome:eligible.length?'REVIEW_SUPPORTED_EXISTING_PAGE_FIRST':'NO_SUPPORTED_TIMELY_CANDIDATE',limitations:['RSS may filter explicit queries and omit evergreen adult demand. Absence is not zero demand.','Approximate RSS traffic labels are provider labels, not site impressions or absolute monthly volume.','First-seen means first collector observation, never an invented provider start time.','No content published, no social enqueue/send, no affiliate registration or conversion created.']};
}
export async function collectRss({geo,state=emptyState(geo),now=Date.now(),fetchImpl=fetch}){
 validateState(state,geo);if(state.lastSuccessAt&&Date.parse(state.lastSuccessAt)>now)throw Error('TRENDS_CLOCK_REGRESSION');const decision=cacheDecision(state,now);if(!decision.fetch)return {state,status:'CACHE_ONLY',cacheReason:decision.reason,requests:0};
 const at=new Date(now).toISOString();let response;
 try{response=await fetchImpl(`https://trends.google.com/trending/rss?geo=${geo}`,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{accept:'application/rss+xml, application/xml, text/xml',...(state.etag?{'if-none-match':state.etag}:{}),...(state.lastModified?{'if-modified-since':state.lastModified}:{})}});
  if(response.status===304&&state.lastSuccessAt){const rows=state.items.filter(r=>r.lastSeenAt===state.lastSuccessAt);return {state:updateHistory(state,rows,at),status:'NOT_MODIFIED',requests:1,xml:null};}
  if(response.status!==200){const status=response.status;const retry=Number(response.headers.get('retry-after'));const backoff=[401,403].includes(status)?6*HOUR:status===429?Math.min(24*HOUR,Math.max(HOUR,Number.isFinite(retry)?retry*1000:0)):15*60000;return {state:{...state,lastAttemptAt:at,failures:state.failures+1,nextFetchAt:new Date(now+backoff).toISOString()},status:`HTTP_${status}`,requests:1};}
  const size=Number(response.headers.get('content-length')||0);if(size>MAX_BYTES)throw Error('RSS_TOO_LARGE');let bytes;if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let total=0;for(;;){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>MAX_BYTES){await reader.cancel();throw Error('RSS_TOO_LARGE');}parts.push(Buffer.from(chunk.value));}bytes=Buffer.concat(parts);}else{bytes=await response.arrayBuffer();if(bytes.byteLength>MAX_BYTES)throw Error('RSS_TOO_LARGE');}const xml=Buffer.from(bytes).toString('utf8');const rows=parseRss(xml);const updated=updateHistory(state,rows,at);
  return {state:{...updated,etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified'),bodyHash:digest(xml)},status:'OK',requests:1,xml};
 }catch(e){return {state:{...state,lastAttemptAt:at,failures:state.failures+1,nextFetchAt:new Date(now+15*60000).toISOString()},status:/^(?:RSS_|XML_)/.test(e.message)?'INVALID_RSS':'TRANSPORT_FAILURE',requests:1};}
}
