import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

test('preview diagnostics distinguish HTTP failure and empty catalog while preserving affiliate fallback',async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.VISUAL_CHROMIUM_PATH?{executablePath:process.env.VISUAL_CHROMIUM_PATH}:{})});
 try {
  for(const scenario of [{status:503,payload:{ok:false,error:'models_unavailable'},stage:'http_response'},{status:200,payload:{models:[]},stage:'empty_catalog'}]){
   const page=await browser.newPage();
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='stripunion-live-models.stripunion.workers.dev')return route.fulfill({status:scenario.status,contentType:'application/json',body:JSON.stringify(scenario.payload)});
    if(url.hostname==='stripunion.com'){
     let file=url.pathname==='/avcams'?'avcams/index.html':url.pathname.slice(1);
     const target=path.resolve('dist',file);
     if(target.startsWith(path.resolve('dist')+path.sep)){
      try{return await route.fulfill({path:target});}catch{}
     }
    }
    return route.abort();
   });
   await page.goto('https://stripunion.com/avcams',{waitUntil:'networkidle'});
   const fallback=page.locator('[data-live-fallback]');await fallback.waitFor({state:'visible'});
   const event=await page.evaluate(()=>window.dataLayer.map(row=>row.event==='live_models_unavailable'?row:row[1]==='live_models_unavailable'?row[2]:null).filter(Boolean).at(-1));
   assert.equal(event.live_models_failure_stage,scenario.stage);
   if(scenario.status===503)assert.equal(event.live_models_http_status,503);
   const href=await fallback.locator('a').getAttribute('href');assert.equal(new URL(href).searchParams.get('targetDomain'),'avcams.online');
   await page.close();
  }
 }finally{await browser.close();}
});
