import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Serve actual built production HTML through Playwright routes. No web server,
// production visit, partner navigation, analytics request or Worker write occurs.
const dist = path.resolve('dist');
const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
assert.ok(html.includes('G-K57BRX69X1'), 'Build an indexable production artifact first');
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}) });
const results = [];
try {
  for (const scenario of ['deny-grant-revoke', 'unreadable-choice', 'staging']) {
    const context = await browser.newContext({serviceWorkers:'block'});
    const firstParty = [];
    const experimentEvents = [];
    let interceptedRequests = 0;
    await context.route('**/*', async route => {
      interceptedRequests++;
      const url = new URL(route.request().url());
      if (url.hostname === 'stripunion-live-models.stripunion.workers.dev') {
        if (url.pathname === '/events/click') firstParty.push(route.request().postDataJSON());
        if (url.pathname === '/events/experiment') experimentEvents.push(route.request().postDataJSON());
        await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"test":true}'});
        return;
      }
      if (['stripunion.com','staging.stripunion.com'].includes(url.hostname)) {
        if (url.pathname === '/') { await route.fulfill({status:200,contentType:'text/html',body:html}); return; }
        const file = path.resolve(dist, '.' + url.pathname);
        if (file.startsWith(dist + path.sep)) {
          try {
            const body = await fs.readFile(file);
            const contentType = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
            await route.fulfill({status:200,contentType,body}); return;
          } catch {}
        }
      }
      // Google, Clarity, fonts/images and all partner URLs are intercepted locally.
      await route.fulfill({status:200,contentType:'application/javascript',body:''});
    });
    await context.addInitScript(({broken}) => {
      document.addEventListener('click', event => {
        if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
      }, true);
      if (broken) Storage.prototype.getItem = function(){throw new Error('test unreadable storage');};
    }, {broken:scenario==='unreadable-choice'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(scenario === 'staging' ? 'https://staging.stripunion.com/' : 'https://stripunion.com/');
    const link = page.locator('a[data-affiliate-source][data-affiliate-partner="avcams"]').first();
    assert.equal(await link.count(), 1);
    const before = new URL(await link.getAttribute('href'));
    await link.evaluate(element => {
      element.setAttribute('data-experiment-id', 'consent-regression-fixture');
      element.setAttribute('data-experiment-treatment-label', 'Reviewed fixture CTA');
    });
    const gaCount = () => page.evaluate(() => (window.dataLayer || []).filter(row => row[0]==='event' && row[1]==='affiliate_click').length);
    const click = async () => { await link.evaluate(element=>element.click()); await page.waitForTimeout(80); };
    await click();
    assert.equal(firstParty.length,0,'default denied must not send first-party click');
    assert.equal(await gaCount(),0,'default denied must not emit optional affiliate analytics');
    assert.equal(experimentEvents.length,0,'default denied must not emit experimental telemetry');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('su_acquisition')).catch(()=>null),null);
    const deniedLink = new URL(await link.getAttribute('href'));
    for (const key of ['userId','campaignId','creativeId','sourceId','p1','p2','targetDomain','path']) {
      const expected = scenario === 'staging' && key === 'campaignId' ? 'su_staging_test'
        : scenario === 'staging' && key === 'sourceId' ? 'stripunion_staging' : before.searchParams.get(key);
      assert.equal(deniedLink.searchParams.get(key),expected,'existing production/staging commercial parameter contract preserved');
    }
    assert.match(deniedLink.searchParams.get('memberId'),/^su_[a-z0-9_]+$/,'preserve configured provider memberId contract');
    await page.locator('[data-consent-choice="granted"]').evaluate(element=>element.click());
    await click();
    const expected = scenario==='deny-grant-revoke' ? 1 : 0;
    assert.equal(firstParty.length,expected,'only readable grant on production hostname permits telemetry');
    assert.equal(await gaCount(),expected);
    assert.equal(experimentEvents.length > 0,expected === 1,'experiment telemetry uses the same readable-grant and production-host gate');
    if (expected) {
      assert.equal(firstParty[0].memberId,new URL(await link.getAttribute('href')).searchParams.get('memberId'));
      assert.equal(firstParty[0].pagePath,'/');
      assert.equal(firstParty[0].sourceId,before.searchParams.get('sourceId'));
      await page.locator('[data-consent-open]').first().evaluate(element=>element.click());
      await page.locator('[data-consent-choice="denied"]').evaluate(element=>element.click());
      await click();
      const experimentCount = experimentEvents.length;
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('stripunion:consent', {detail:{analytics_storage:'granted'}})));
      await page.waitForTimeout(80);
      assert.equal(experimentEvents.length,experimentCount,'a stale event cannot bypass current denied storage');
      assert.equal(firstParty.length,1,'revocation must stop subsequent first-party events');
      assert.equal(await gaCount(),1,'revocation must stop subsequent affiliate GA events');
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('su_acquisition')),null);
    }
    assert.deepEqual(errors,[]);
    results.push({scenario,firstPartyEvents:firstParty.length,affiliateGaEvents:await gaCount(),
      experimentEvents:experimentEvents.length,interceptedRequests,externalNetworkRequests:0,commercialParametersPreserved:true});
    await context.close();
  }
} finally { await browser.close(); }
const report = {version:1,builtArtifact:true,liveProductionAcceptance:false,results};
await fs.mkdir('artifacts/affiliate-consent',{recursive:true});
await fs.writeFile('artifacts/affiliate-consent/report.json',JSON.stringify(report,null,2)+'\n');
console.log('AFFILIATE_CONSENT_BROWSER ' + JSON.stringify(report));
