import fs from 'node:fs/promises';import {hubs} from './search-growth-decisions.mjs';
const rows=[];
for(const slug of ['',...hubs])for(const host of ['stripunion.com','www.stripunion.com']){
 const path=slug?'/'+slug+'/':'/';const r=await fetch('https://'+host+path,{redirect:'manual',signal:AbortSignal.timeout(15000)});const html=r.status===200?await r.text():'';
 rows.push({host,path,status:r.status,location:r.headers.get('location'),canonical:html.match(/rel="canonical"[^>]+href="([^"]+)/)?.[1]||null,noindex:/<meta[^>]+name="robots"[^>]+noindex/.test(html)});
}
const r=await fetch('https://stripunion.com/sitemap.xml',{signal:AbortSignal.timeout(15000)});const xml=await r.text();
const result={checkedAt:new Date().toISOString(),rows,sitemap:{http:r.status,urlCount:[...xml.matchAll(/<loc>/g)].length,indexPercentage:null,reason:'Sitemap URLs, GSC indexing samples, Bing indexed pages and publication jobs have different scopes; not a site-wide index percentage'}};
await fs.mkdir('artifacts/search-growth',{recursive:true});await fs.writeFile('artifacts/search-growth/public-health.json',JSON.stringify(result,null,2)+'\n');console.log('SEARCH_PUBLIC_AUDIT '+JSON.stringify(result));
