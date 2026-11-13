import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const response = await fetch('https://stripunion.com/', {redirect:'error',signal:AbortSignal.timeout(15000)});
assert.equal(response.status,200);
const html = await response.text();
assert.ok(html.includes('G-K57BRX69X1'));
const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext({serviceWorkers:'block'});
  let workerClicks=0, requestsIntercepted=0;
  await context.route('**/*', async route => {
    requestsIntercepted++;
    const url = new URL(route.request().url());
    if(url.hostname==='stripunion.com' && url.pathname==='/') return route.fulfill({status:200,contentType:'text/html',body:html});
    if(url.hostname==='stripunion-live-models.stripunion.workers.dev' && url.pathname==='/events/click') workerClicks++;
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  await context.addInitScript(()=>document.addEventListener('click',event=>{if(event.target instanceof Element && event.target.closest('a')) event.preventDefault();},true));
  const page=await context.newPage(); await page.goto('https://stripunion.com/');
  const link=page.locator('a[data-affiliate-source][data-affiliate-partner="avcams"]').first();
  const clicks=()=>link.evaluate(element=>element.click());
  const ga=()=>page.evaluate(()=>(window.dataLayer||[]).filter(row=>row[0]==='event' && row[1]==='affiliate_click').length);
  await clicks();await page.waitForTimeout(100); assert.equal(workerClicks,0);assert.equal(await ga(),0);
  await page.locator('[data-consent-choice="granted"]').evaluate(el=>el.click());
  await clicks();await page.waitForTimeout(100);assert.equal(workerClicks,1);assert.equal(await ga(),1);
  await page.locator('[data-consent-open]').first().evaluate(el=>el.click());
  await page.locator('[data-consent-choice="denied"]').evaluate(el=>el.click());
  await clicks();await page.waitForTimeout(100);assert.equal(workerClicks,1);assert.equal(await ga(),1);
  const report={liveHtmlFetched:true,defaultDenied:true,grant:true,revocation:true,allBrowserRequestsIntercepted:true,requestsIntercepted,externalWorkerWrites:0,externalAnalyticsEvents:0,partnerNavigations:0,ga4ActualCollection:'NOT_TESTED'};
  await fs.mkdir('work/recovery',{recursive:true}); await fs.writeFile('work/recovery/production-consent-browser.json',JSON.stringify(report,null,2)+'\n');
  console.log('PRODUCTION_CONSENT_BROWSER '+JSON.stringify(report));
} finally {await browser.close();}
