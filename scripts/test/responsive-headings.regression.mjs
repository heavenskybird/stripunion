import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
test('premium guide heading wraps with DejaVu Sans and monospace fallback at 320px',async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.VISUAL_CHROMIUM_PATH?{executablePath:process.env.VISUAL_CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:320,height:760}});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='stripunion.com'){
    let file=path.resolve('dist',url.pathname.slice(1));
    if(file.startsWith(path.resolve('dist')+path.sep)){
     try{if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');return await route.fulfill({path:file});}catch{}
    }
   }
   return route.abort();
  });
  await page.goto('https://stripunion.com/guides/premium-adult-video-subscription-value-privacy-guide',{waitUntil:'networkidle'});
  for(const font of ['DejaVu Sans','monospace']){
   const geometry=await page.evaluate(font=>{const h=document.querySelector('h1');h.style.fontFamily=font;const range=document.createRange();range.selectNodeContents(h);return{overflow:document.documentElement.scrollWidth-innerWidth,textRight:Math.max(...[...range.getClientRects()].map(r=>r.right)),elementRight:h.getBoundingClientRect().right};},font);
   assert.ok(geometry.overflow<=2,JSON.stringify({font,...geometry}));assert.ok(geometry.textRight<=322,JSON.stringify({font,...geometry}));
  }
 }finally{await browser.close();}
});
