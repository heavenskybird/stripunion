import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const authorization=JSON.parse(await fs.readFile('../audit/docs/audits/2026-11-12/ga4-single-event-authorization.json','utf8'));
const checkpoint={ga4SingleEventAuthorized:authorization.authorized===true&&authorization.maxEvents===1,expectedMergeSha:authorization.releaseSha};
if(process.env.GITHUB_RUN_ATTEMPT!=='1'||process.env.GITHUB_EVENT_NAME!=='push')throw new Error('NO_RERUN_OR_MANUAL_GA4_REPLAY');
if(checkpoint.ga4SingleEventAuthorized!==true) throw new Error('EXPLICIT_SINGLE_EVENT_AUTHORIZATION_REQUIRED');
const publicHtml=await fetch('https://stripunion.com/',{redirect:'error',signal:AbortSignal.timeout(15000)});
assert.equal(publicHtml.status,200);const html=await publicHtml.text();
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({serviceWorkers:'block'});const sent=[];const statuses=[];let blocked=0;const blockedGoogle=[];
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin==='https://stripunion.com'&&u.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:html});
  if(u.origin==='https://www.googletagmanager.com'&&['/gtag/js','/gtag/destination'].includes(u.pathname)&&u.searchParams.get('id')==='G-K57BRX69X1'&&req.method()==='GET')return route.continue();
  if(/(^|\.)google-analytics\.com$|(^|\.)analytics\.google\.com$/.test(u.hostname)&&u.pathname==='/g/collect'){
   const params=new URLSearchParams(u.search);
   const body=req.postData()||'';
   const bodyParams=new URLSearchParams(body);
   const event=params.get('en')||bodyParams.get('en');
   const names=[...body.matchAll(/(?:^|[&\n])en=([^&\n]+)/g)].map(m=>decodeURIComponent(m[1]));
   if(event==='recovery_consent_check'&&params.get('tid')==='G-K57BRX69X1'&&names.every(n=>n===event)&&names.length<=1&&sent.length===0){
    sent.push({event,measurementId:'G-K57BRX69X1',at:new Date().toISOString()});return route.continue();
   }
  }
  if(/google/.test(u.hostname)&&blockedGoogle.length<20)blockedGoogle.push({host:u.hostname,path:u.pathname,event:u.searchParams.get('en')||new URLSearchParams(req.postData()||'').get('en'),measurementId:u.searchParams.get('tid')});
  blocked++;return route.fulfill({status:200,contentType:'application/javascript',body:''});
 });
 const page=await context.newPage();
 page.on('response',r=>{try{const u=new URL(r.url());if(/(^|\.)google-analytics\.com$|(^|\.)analytics\.google\.com$/.test(u.hostname)&&u.pathname==='/g/collect'&&(u.searchParams.get('en')||new URLSearchParams(r.request().postData()||'').get('en'))==='recovery_consent_check')statuses.push(r.status());}catch{}});
 await page.goto('https://stripunion.com/');
 await page.waitForFunction(()=>!!window.google_tag_manager,{},{timeout:30000});
 await page.locator('[data-consent-choice="granted"]').evaluate(el=>el.click());
 await page.evaluate(sha=>window.gtag('event','recovery_consent_check',{debug_mode:true,release_sha:sha,send_to:'G-K57BRX69X1'}),checkpoint.expectedMergeSha);
 for(let i=0;i<30&&statuses.length===0;i++)await page.waitForTimeout(1000);
 const report={authorizedBy:'explicit user reply in recovery conversation',sent,statuses,otherRequestsBlocked:blocked,blockedGoogle,workerWrites:0,partnerNavigations:0,purchases:0,postbacks:0,propertyIngestion:'UNKNOWN_REQUIRES_REALTIME_OR_DEBUGVIEW',releaseSha:checkpoint.expectedMergeSha};
 await fs.writeFile('work/recovery/ga4-single-event.json',JSON.stringify(report,null,2)+'\n');console.log('GA4_SINGLE_EVENT '+JSON.stringify(report));
 assert.equal(sent.length,1);assert.ok(statuses.some(s=>s>=200&&s<300),'GA4 transport must return 2xx');
}finally{await browser.close();}
