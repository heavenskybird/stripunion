import { chromium } from 'playwright';
import fs from 'node:fs';
// Uses built HTML and synthetic local responses; never visits production or partner rooms.
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
const context=await browser.newContext();
const page=await context.newPage();
const html=fs.readFileSync('dist/avcams/index.html','utf8').replace('</head>', '<style>[data-live-models]{margin-top:2000px!important}</style></head>');
await page.clock.install({time:new Date('2026-11-20T00:00:00Z')});
await page.clock.pauseAt(new Date('2026-11-20T00:00:01Z'));
let modelRequests=0;
let failed=false;
await page.route('**/*',async route=>{
 const url=route.request().url();
 if(url.startsWith('https://local.example/')){
  const path=new URL(url).pathname;
  if(path.startsWith('/_astro/'))return route.fulfill({contentType:path.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync('dist'+path)});
  return route.fulfill({contentType:'text/html',body:html});
 }
 if(url.includes('/models?')){
  modelRequests++;
  const now=await page.evaluate(()=>Date.now());
  return failed?route.fulfill({status:503,body:'{}'}):route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,stale:false,refreshedAt:new Date(now).toISOString(),validUntil:new Date(now+90000).toISOString(),models:[{id:1,username:'fixture',status:'public',snapshotUrl:'https://cdn.example.invalid/image.jpg'}]})});
 }
 return route.abort();
});
await page.goto('https://local.example/avcams');
if(modelRequests!==0)throw Error('inventory fetched before viewport entry');
await page.locator('[data-live-models]').scrollIntoViewIfNeeded();
await page.waitForSelector('.live-model-card');
console.log('PASS Chromium: no inventory request before viewport entry');
console.log('PASS Chromium: fresh fixture card rendered');
const link=await page.locator('.live-model-card a').first().getAttribute('href');
if(new URL(link).searchParams.get('targetDomain')!=='avcams.online')throw Error('tracking');
if(await page.locator('video,iframe').count())throw Error('unexpected player');
await page.evaluate(() => document.addEventListener('click', event => event.preventDefault(), true));
await page.locator('.live-model-card a').first().evaluate(element => element.click());
const clicked = new URL(await page.locator('.live-model-card a').first().getAttribute('href'));
for (const key of ['userId','campaignId','creativeId','sourceId','p1','p2','p3','memberId','targetDomain','path']) {
 if (!clicked.searchParams.get(key)) throw Error('missing tracking parameter '+key);
}
console.log('PASS Chromium: dynamic card click retains all affiliate parameters including p3/memberId');
await page.evaluate(()=>{window.originalCard=document.querySelector('.live-model-card');});
await page.clock.runFor(59_999);
if(modelRequests!==1)throw Error('polled sooner than 60 seconds');
await page.clock.runFor(1);
await page.waitForFunction(()=>window.dataLayer && document.querySelector('.live-model-card'));
// Wait for the intercepted response to settle without advancing another poll.
await new Promise(resolve=>setTimeout(resolve,100));
if(modelRequests!==2)throw Error('expected one healthy 60-second revalidation');
if(!await page.evaluate(()=>document.querySelector('.live-model-card')===window.originalCard))throw Error('healthy renewal replaced identical cards');
if(await page.evaluate(()=>(window.dataLayer||[]).filter(e=>e.event==='live_models_loaded'||(e[0]==='event'&&e[1]==='live_models_loaded')).length)!==1)throw Error('repeated loaded analytics');
console.log('PASS Chromium: 60-second renewal preserves image DOM and does not repeat loaded analytics');
for(const width of [320,360,375,390,412,768,1280]){
 await page.setViewportSize({width,height:900});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error('overflow '+width);
}
console.log('PASS Chromium: seven widths, no document overflow, image-only AVCams route');
await page.locator('[data-live-models]').scrollIntoViewIfNeeded();
failed=true;
await page.clock.runFor(60_000);
await page.waitForFunction(()=>document.querySelectorAll('.live-model-card').length===0,{},{timeout:12000});
if(!await page.locator('[data-live-fallback]').isVisible())throw Error('fallback hidden');
console.log('PASS Chromium: failed revalidation removes previous cards and exposes fallback');
await browser.close();
