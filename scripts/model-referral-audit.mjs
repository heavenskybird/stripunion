import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const hash = text => createHash('sha256').update(text).digest('hex');
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&#38;', '&');
export function modelLinks(html) {
  return [...html.matchAll(/<a\b[^>]*>/gi)].map(m=>m[0]).filter(tag=>/data-avcams-path=["']\/signup\/model["']/.test(tag)).map(tag=>{
    const read=name=>decode(tag.match(new RegExp(name+'=["\']([^"\']+)["\']'))?.[1] || '');
    return { href:read('href'), source:read('data-affiliate-source'), mode:read('data-affiliate-mode'), rel:read('rel') };
  });
}
export function allowedReferralUrl(raw) {
  const u=new URL(raw);
  const allowed=['avcams.online','go.avcams.online','go.whitetrafsa.com','stripchat.com','www.stripchat.com'];
  if(u.protocol!=='https:' || u.username || u.password || u.port || !allowed.includes(u.hostname))throw Error('REFERRAL_HOST_REFUSED');
  if (/(?:^|\/)(?:api|go|postback|click)(?:\/|$)/i.test(u.pathname)) throw Error('CLICK_RECEIVER_PATH_REFUSED');
  if(u.searchParams.has('memberId') || u.searchParams.has('p3'))throw Error('SYNTHETIC_CLICK_ID_REFUSED');
  return u;
}
export function urlEvidence(raw, expectedUserId) {
  const u=allowedReferralUrl(raw);
  return {host:u.hostname,path:u.pathname,queryKeys:[...u.searchParams.keys()].sort(),
    expectedReferralIdPresent:expectedUserId ? u.searchParams.get('userId')===expectedUserId : null,
    campaignId:u.searchParams.get('campaignId') || null,sourceId:u.searchParams.get('sourceId') || null,
    p1:u.searchParams.get('p1') || null,p2:u.searchParams.get('p2') || null};
}
export async function traceReferral(raw,{fetchImpl=fetch,expectedUserId,maxHops=6}={}) {
  let current=allowedReferralUrl(raw),chain=[];
  const seen=new Set();
  for(let hop=0;hop<maxHops;hop++) {
    if(seen.has(current.href))return {state:'REDIRECT_LOOP',chain,attributionCredit:'UNPROVEN'};
    seen.add(current.href);
    let response;
    try {response=await fetchImpl(current.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'user-agent':'StripUnion-Model-Referral-Audit/1.0'}});}
    catch {return {state:'WEB_FETCH_LIMITATION',chain,attributionCredit:'UNPROVEN'};}
    const entry={...urlEvidence(current.href,expectedUserId),status:response.status};chain.push(entry);
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location');
      if(!location)return {state:'REDIRECT_WITHOUT_LOCATION',chain,attributionCredit:'UNPROVEN'};
      try {current=allowedReferralUrl(new URL(location,current).href);}catch{return {state:'UNAPPROVED_REDIRECT_HELD',chain,attributionCredit:'UNPROVEN'};}
      continue;
    }
    const html=await response.text();
    const challenge=response.headers.get('cf-mitigated')==='challenge' || /<title>\s*(?:Just a moment|Access denied|Attention Required)/i.test(html);
    const official=current.hostname==='stripchat.com'||current.hostname==='www.stripchat.com';
    const modelPath=/^\/(?:become-a-model|signup\/model)(?:\/|$)/.test(current.pathname);
    return {state:challenge?'PROVIDER_CHALLENGE':response.status===200&&official&&modelPath?'OFFICIAL_MODEL_ROUTE_200':'DESTINATION_NOT_VERIFIED',chain,
      htmlSha256:hash(html),officialModelPath:official&&modelPath,referralIdInFinalUrl:expectedUserId ? current.searchParams.get('userId')===expectedUserId : null,
      attributionCredit:'UNPROVEN',note:'A GET path/parameter check does not prove signup, country eligibility, provider credit or earned revenue.'};
  }
  return {state:'HOP_LIMIT',chain,attributionCredit:'UNPROVEN'};
}
async function main() {
  const output='artifacts/model-referral';await fs.mkdir(output,{recursive:true});
  const report={checkedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA || 'LOCAL',requests:'GET_ONLY',signupSubmissions:0,clickReceiverRequests:0,externalMessages:0,
    warning:'Reading an upstream tracking redirect can register a diagnostic partner click; no fabricated memberId, acquisition p3, signup, purchase or referral reward is sent.'};
  const compiled=await fs.readFile('dist/become-a-cam-model/index.html','utf8');
  const expected=modelLinks(compiled);report.compiled={modelCtas:expected.length,paidReferral:/Paid referral/.test(compiled),candidateMarker:compiled.includes('data-model-referral-version="2026-11-15"')};
  try {
    const response=await fetch('https://stripunion.com/become-a-cam-model/',{method:'GET',redirect:'follow',signal:AbortSignal.timeout(20000)});
    const html=await response.text();const links=modelLinks(html);
    report.production={http:response.status,modelCtas:links.length,htmlSha256:hash(html),candidateDeployed:html.includes('data-model-referral-version="2026-11-15"'),paidReferral:/Paid referral/.test(html),
      links:links.map(l=>({...urlEvidence(l.href),source:l.source,mode:l.mode,sponsored:l.rel.includes('sponsored')}))};
    const live=links.find(l=>l.source==='become_model_hero');
    if(live)report.liveTrackedRoute=await traceReferral(live.href,{expectedUserId:new URL(live.href).searchParams.get('userId')});
  }catch{report.production={state:'WEB_FETCH_LIMITATION'};}
  report.whiteLabelModelRoute=await traceReferral('https://avcams.online/signup/model');
  report.countryEligibility='UNKNOWN_REQUIRES_CURRENT_ACCOUNT_REFERRAL_TERMS';
  report.partnerCredit='UNPROVEN_NO_SIGNUP_OR_REWARD_TEST';
  await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log('MODEL_REFERRAL_READ_ONLY '+JSON.stringify(report));
  if(report.compiled.modelCtas!==3 || !report.compiled.paidReferral || !report.compiled.candidateMarker)throw Error('COMPILED_MODEL_CTA_CONTRACT_FAILED');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await main();
