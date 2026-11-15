import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const slugs=['adult-affiliate-webmaster-program-evaluation-guide','adult-affiliate-program-business-model-structure-comparison','adult-affiliate-program-application-readiness'];
const expected='https://stripcash.com/sign-up/stripunion';
const hash=s=>createHash('sha256').update(s).digest('hex');
const rows=[];
for(const slug of slugs){
 const url='https://stripunion.com/guides/'+slug+'/';
 try{
  const response=await fetch(url,{redirect:'manual',headers:{'user-agent':'StripUnion-Commercial-ReadOnly-Acceptance/1.0'},signal:AbortSignal.timeout(20000)});
  const html=await response.text();const article=html.match(/<article\b[^>]*class="[^"]*guide-body[^>]*>([\s\S]*?)<\/article>/i)?.[1]||'';
  const anchor=(article.match(/<a\b[^>]*>/g)||[]).find(a=>a.includes('data-affiliate-partner="stripcash_referral"'))||'';
  const href=anchor.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;','&');
  const source=anchor.match(/data-affiliate-source="([^"]+)"/)?.[1];
  const sponsored=/rel="[^"]*\bsponsored\b/.test(anchor), disclosure=/Paid referral:/i.test(article)&&/commission/i.test(article)&&/No earnings are guaranteed/i.test(article);
  const canonical=html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  const ok=response.status===200&&href===expected&&source==='guide_webmaster_'+slug&&sponsored&&disclosure&&canonical===url;
  rows.push({slug,url,status:response.status,canonical,cta:!!anchor,paidReferralDisclosure:disclosure,sponsored,source,expectedDestinationMatches:href===expected,articleSha256:hash(article),ctaContractSha256:hash([slug,href,source,sponsored,disclosure].join('|')),ok,
    attribution:'GA4 affiliate_click with partner/source, gated by consent; direct-referral has no proven provider per-page SubID or registration/revenue receipt.'});
 }catch{rows.push({slug,url,ok:false,classification:'PRODUCTION_GET_UNVERIFIED'});}
}
// Inspect only the official sign-up landing; never submit a form or hit click/postback receivers.
let partner={status:'UNKNOWN'};
try{const r=await fetch(expected,{redirect:'manual',signal:AbortSignal.timeout(20000)});partner={http:r.status,locationHost:r.headers.get('location')?new URL(r.headers.get('location'),expected).hostname:null,formSubmitted:false,creditVerified:false};}catch{partner={status:'PROVIDER_GET_UNVERIFIED',formSubmitted:false,creditVerified:false};}
const candidateRows=[];
for(const slug of ['live-cam-platform-model-fit-comparison','live-cam-private-interaction-visibility-choice']){
 const url='https://stripunion.com/guides/'+slug+'/';
 try{
  const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});const html=await r.text();
  const article=html.match(/<article\b[^>]*class="[^"]*guide-body[^>]*>([\s\S]*?)<\/article>/i)?.[1]||'';
  const anchor=(article.match(/<a\b[^>]*>/g)||[]).find(a=>a.includes('data-affiliate-source="guide_viewer_'+slug+'"'))||'';
  const raw=anchor.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;','&');const target=raw?new URL(raw):null;
  const source='guide_viewer_'+slug;
  const canonical=html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  const indexable=!/noindex/i.test(r.headers.get('x-robots-tag')||'')&&!/name="robots" content="[^"]*noindex/i.test(html);
  const tracked=target?.hostname==='go.whitetrafsa.com'&&target.searchParams.get('targetDomain')==='avcams.online'&&target.searchParams.get('path')==='/girls'&&target.searchParams.get('p2')===source&&!!target.searchParams.get('p1')&&!!target.searchParams.get('userId');
  const disclosure=/Paid link/.test(article)&&/may earn a commission/.test(article)&&/not model registration/.test(article);
  const sponsored=/rel="[^"]*\bsponsored\b/.test(anchor);
  candidateRows.push({slug,url,status:r.status,canonical,indexable,cta:!!anchor,tracked:!!tracked,disclosure,sponsored,source,ctaContractSha256:hash([slug,raw,source,sponsored,disclosure].join('|')),ok:r.status===200&&canonical===url&&indexable&&!!tracked&&disclosure&&sponsored});
 }catch{candidateRows.push({slug,url,ok:false,classification:'CANDIDATE_GET_UNVERIFIED'});}
}
const report={checkedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA||'LOCAL',rows,candidateRows,candidateReleaseRequired:process.argv.includes('--require-candidate'),partner,productionWrites:0,paidConversionsGenerated:0,proof:'HTTP + served article/CTA contract fingerprint; provider Git commit SHA and actual commission are not inferred.'};
await fs.mkdir('artifacts/commercial',{recursive:true});await fs.writeFile('artifacts/commercial/production-pilot.json',JSON.stringify(report,null,2)+'\n');
console.log('COMMERCIAL_LIVE_ACCEPTANCE '+JSON.stringify(report));if(rows.some(r=>!r.ok)||process.argv.includes('--require-candidate')&&candidateRows.some(r=>!r.ok))process.exitCode=1;
